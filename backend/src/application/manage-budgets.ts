import {
  budgetState,
  endOfLocalDay,
  normalizeBudget,
  startOfLocalDay,
  stopReason,
  type BudgetAction,
  type BudgetScope,
  type BudgetState,
} from '../domain/budget.js';
import { estimateCost } from '../domain/pricing.js';
import type { SessionEventRow } from '../domain/session-summary.js';
import type { UsageEntry } from '../domain/token-usage.js';
import { roundCost } from './get-usage-metrics.js';
import type { AllowanceRecord, Broadcaster, BudgetRecord, BudgetStore, Clock, EventRepository, IdGenerator, TranscriptReader } from './ports.js';

const SUBJECTS_LIMIT = 20;
const RANK: Record<BudgetState, number> = { within: 0, near: 1, exceeded: 2 };

/** `BudgetSubject` de `spec/api-spec.yaml` (AC-77). */
export interface BudgetSubject {
  session_id: string | null;
  project: string | null;
  spent_usd: number;
  ratio: number;
  state: BudgetState;
  allowed: boolean;
}

/** `Budget` de `spec/api-spec.yaml`. */
export interface Budget extends BudgetRecord {
  state: BudgetState;
  spent_usd: number;
  subjects: BudgetSubject[];
  sessions_tracked: number;
  allowances: AllowanceRecord[];
}

export interface BudgetStop {
  budget_id: string;
  scope: BudgetScope;
  reason: string;
  spent_usd: number;
  limit_usd: number;
}

export interface BudgetStatus {
  stop: BudgetStop | null;
  checked_at: string;
}

/** `BudgetStateMessage` de `spec/api-spec.yaml` (AC-81). */
export interface BudgetStateMessage {
  type: 'budget.state';
  budget_id: string;
  scope: BudgetScope;
  project: string | null;
  session_id: string | null;
  action: BudgetAction;
  state: BudgetState;
  previous_state: BudgetState;
  spent_usd: number;
  limit_usd: number;
}

export type BudgetResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 404; message: string };

interface SessionSpend {
  session_id: string;
  project: string;
  /** Coste de toda la vida de la Sesión y sus Subagentes. */
  lifetime_usd: number;
  /** Coste de las respuestas de hoy. */
  today_usd: number;
}

interface Spending {
  sessions: SessionSpend[];
  computedAt: number;
}

export interface BudgetOptions {
  /** Cuánto se reutiliza el gasto calculado (AC-79); 0 lo recalcula siempre. */
  spendingTtlMs?: number;
}

const DEFAULT_TTL_MS = 3000;

const allowedNow = (a: AllowanceRecord, now: Date) => a.until === null || Date.parse(a.until) > now.getTime();

function costOf(entries: UsageEntry[], since?: Date): number {
  let total = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.messageId)) continue;
    seen.add(entry.messageId);
    if (since !== undefined && Date.parse(entry.timestamp) < since.getTime()) continue;
    total += estimateCost(entry.model, entry.usage) ?? 0;
  }
  return total;
}

/**
 * Casos de uso de los Presupuestos (AC-76 a AC-81, ADR-0010): configuración, gasto y
 * estado, excepciones, el estado que consulta el hook y la vigilancia por WebSocket.
 */
export class ManageBudgets {
  private cache: Spending | undefined;
  /** Último estado vigilado de cada ámbito, para difundir solo las transiciones (AC-81). */
  private readonly watched = new Map<string, { state: BudgetState; message: Omit<BudgetStateMessage, 'state' | 'previous_state'> }>();

  constructor(
    private readonly repository: EventRepository,
    private readonly transcripts: TranscriptReader,
    private readonly store: BudgetStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly broadcaster: Broadcaster,
    private readonly options: BudgetOptions = {},
  ) {}

  /** Olvida el gasto calculado: el próximo cálculo relee los Transcripts (ya cacheados). */
  invalidate(): void {
    this.cache = undefined;
  }

  async list(): Promise<{ items: Budget[]; generated_at: string }> {
    const now = this.clock.now();
    const spending = await this.spending();
    return { items: this.store.list().map((b) => this.describe(b, spending, now)), generated_at: now.toISOString() };
  }

  async create(body: unknown): Promise<BudgetResult<Budget>> {
    const parsed = normalizeBudget(body);
    if (!parsed.ok) return { ok: false, status: 400, message: parsed.message };
    const now = this.clock.now().toISOString();
    const record: BudgetRecord = { id: this.ids.next(), ...parsed.value, created_at: now, updated_at: now };
    this.store.insert(record);
    return { ok: true, value: await this.described(record) };
  }

  async update(id: string, body: unknown): Promise<BudgetResult<Budget>> {
    const current = this.store.find(id);
    if (!current) return { ok: false, status: 404, message: `No existe el Presupuesto ${id}` };
    const parsed = normalizeBudget(body);
    if (!parsed.ok) return { ok: false, status: 400, message: parsed.message };
    // Cambiar el ámbito o el Proyecto deja sin sentido las excepciones que había.
    if (parsed.value.scope !== current.scope || parsed.value.project !== current.project) this.store.clearAllowances(id);
    const record: BudgetRecord = { ...current, ...parsed.value, updated_at: this.clock.now().toISOString() };
    this.store.update(record);
    return { ok: true, value: await this.described(record) };
  }

  remove(id: string): boolean {
    return this.store.delete(id);
  }

  async addAllowance(id: string, body: unknown): Promise<BudgetResult<AllowanceRecord>> {
    const budget = this.store.find(id);
    if (!budget) return { ok: false, status: 404, message: `No existe el Presupuesto ${id}` };
    const raw = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const session = typeof raw.session_id === 'string' && raw.session_id !== '' ? raw.session_id : null;
    const project = typeof raw.project === 'string' && raw.project !== '' ? raw.project : null;
    if ((session === null) === (project === null)) return { ok: false, status: 400, message: 'Indica una Sesión o un Proyecto, no ambos ni ninguno' };
    if (session !== null && budget.scope !== 'session') return { ok: false, status: 400, message: 'Una excepción de Sesión solo aplica a un Presupuesto por Sesión' };
    if (project !== null && budget.project !== null && budget.project !== project) {
      return { ok: false, status: 400, message: 'El Proyecto de la excepción no es el del Presupuesto' };
    }
    const now = this.clock.now();
    const record: AllowanceRecord = {
      id: this.ids.next(),
      budget_id: id,
      session_id: session,
      project,
      until: session !== null ? null : endOfLocalDay(now).toISOString(),
      created_at: now.toISOString(),
    };
    this.store.addAllowance(record);
    return { ok: true, value: record };
  }

  removeAllowance(id: string, allowanceId: string): boolean {
    return this.store.removeAllowance(id, allowanceId);
  }

  /**
   * ¿Hay que parar al agente de esta Sesión? Lo consulta el hook (ADR-0010). Solo cuentan
   * los Presupuestos activos con acción `stop` que están Superados y sin excepción vigente.
   */
  async status(sessionId: string, project: string): Promise<BudgetStatus> {
    const now = this.clock.now();
    const budgets = this.store.list().filter((b) => b.enabled && b.action === 'stop');
    if (budgets.length === 0) return { stop: null, checked_at: now.toISOString() };
    const allowances = this.store.allowances().filter((a) => allowedNow(a, now));
    // El gasto de la Sesión que consulta se recalcula al momento; el del resto puede tener unos segundos.
    const spending = await this.spending();
    const fresh = await this.sessionSpend(sessionId, startOfLocalDay(now));
    const sessions = [...spending.sessions.filter((s) => s.session_id !== sessionId), ...(fresh ? [fresh] : [])];
    const own = fresh ?? { session_id: sessionId, project, lifetime_usd: 0, today_usd: 0 };

    let worst: { budget: BudgetRecord; spent: number } | undefined;
    for (const budget of budgets) {
      const mine = allowances.filter((a) => a.budget_id === budget.id);
      let spent = 0;
      if (budget.scope === 'session') {
        if (budget.project !== null && budget.project !== project) continue;
        if (mine.some((a) => a.session_id === sessionId || a.project === project)) continue;
        spent = own.lifetime_usd;
      } else if (budget.scope === 'project_day') {
        if (budget.project !== project || mine.some((a) => a.project === project)) continue;
        spent = sessions.filter((s) => s.project === project).reduce((sum, s) => sum + s.today_usd, 0);
      } else {
        if (mine.some((a) => a.project === project)) continue;
        spent = sessions.reduce((sum, s) => sum + s.today_usd, 0);
      }
      if (spent <= budget.limit_usd) continue;
      if (!worst || spent / budget.limit_usd > worst.spent / worst.budget.limit_usd) worst = { budget, spent };
    }
    if (!worst) return { stop: null, checked_at: now.toISOString() };
    const spent = roundCost(worst.spent);
    return {
      stop: {
        budget_id: worst.budget.id,
        scope: worst.budget.scope,
        reason: stopReason(worst.budget, worst.budget.limit_usd, spent),
        spent_usd: spent,
        limit_usd: worst.budget.limit_usd,
      },
      checked_at: now.toISOString(),
    };
  }

  /** Revisa los Presupuestos y difunde los cambios de estado desde la última vez (AC-81). */
  async tick(): Promise<void> {
    this.invalidate();
    const { items } = await this.list();
    const current = new Map<string, { state: BudgetState; message: Omit<BudgetStateMessage, 'state' | 'previous_state'> }>();
    for (const budget of items) {
      if (!budget.enabled) continue;
      for (const subject of budget.subjects) {
        const key = `${budget.id}|${subject.session_id ?? ''}|${subject.project ?? ''}`;
        // Con una excepción vigente el ámbito no avisa: cuenta como Dentro.
        const state = subject.allowed ? 'within' : subject.state;
        current.set(key, {
          state,
          message: {
            type: 'budget.state',
            budget_id: budget.id,
            scope: budget.scope,
            project: subject.project ?? budget.project,
            session_id: subject.session_id,
            action: budget.action,
            spent_usd: subject.spent_usd,
            limit_usd: budget.limit_usd,
          },
        });
      }
    }
    // Lo que ya no aparece (borrado, desactivado o de nuevo Dentro) vuelve a Dentro.
    for (const [key, previous] of this.watched) {
      if (!current.has(key) && previous.state !== 'within') {
        this.broadcaster.broadcast({ ...previous.message, state: 'within', previous_state: previous.state } satisfies BudgetStateMessage);
      }
    }
    for (const [key, now] of current) {
      const before = this.watched.get(key)?.state ?? 'within';
      if (now.state !== before) {
        this.broadcaster.broadcast({ ...now.message, state: now.state, previous_state: before } satisfies BudgetStateMessage);
      }
    }
    this.watched.clear();
    for (const [key, value] of current) if (value.state !== 'within') this.watched.set(key, value);
  }

  /** Repite `tick` cada `intervalMs` en segundo plano (AC-81). */
  start(intervalMs: number): () => void {
    if (intervalMs <= 0) return () => {};
    let running = false;
    const timer = setInterval(() => {
      if (running) return;
      running = true;
      this.tick()
        .catch(() => undefined)
        .finally(() => {
          running = false;
        });
    }, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  private async described(record: BudgetRecord): Promise<Budget> {
    return this.describe(record, await this.spending(), this.clock.now());
  }

  private describe(budget: BudgetRecord, spending: Spending, now: Date): Budget {
    const allowances = this.store.allowances().filter((a) => a.budget_id === budget.id && allowedNow(a, now));
    const subject = (fields: Pick<BudgetSubject, 'session_id' | 'project'> & { spent: number; allowed: boolean }): BudgetSubject => ({
      session_id: fields.session_id,
      project: fields.project,
      spent_usd: roundCost(fields.spent),
      ratio: fields.spent / budget.limit_usd,
      state: budgetState(fields.spent, budget.limit_usd, budget.warn_ratio),
      allowed: fields.allowed,
    });

    let subjects: BudgetSubject[];
    let tracked = 0;
    if (budget.scope === 'session') {
      const own = spending.sessions.filter((s) => budget.project === null || s.project === budget.project);
      tracked = own.length;
      subjects = own
        .map((s) =>
          subject({
            session_id: s.session_id,
            project: s.project,
            spent: s.lifetime_usd,
            allowed: allowances.some((a) => a.session_id === s.session_id || (a.project !== null && a.project === s.project)),
          }),
        )
        .filter((s) => s.state !== 'within')
        .sort((a, b) => b.ratio - a.ratio)
        .slice(0, SUBJECTS_LIMIT);
    } else if (budget.scope === 'project_day') {
      const spent = spending.sessions.filter((s) => s.project === budget.project).reduce((sum, s) => sum + s.today_usd, 0);
      subjects = [subject({ session_id: null, project: budget.project, spent, allowed: allowances.some((a) => a.project === budget.project) })];
    } else {
      subjects = [subject({ session_id: null, project: null, spent: spending.sessions.reduce((sum, s) => sum + s.today_usd, 0), allowed: false })];
    }
    const worst = subjects.reduce<BudgetSubject | undefined>((best, s) => (!best || RANK[s.state] > RANK[best.state] || (RANK[s.state] === RANK[best.state] && s.ratio > best.ratio) ? s : best), undefined);
    return {
      ...budget,
      state: worst?.state ?? 'within',
      spent_usd: worst?.spent_usd ?? 0,
      subjects,
      sessions_tracked: tracked,
      allowances,
    };
  }

  /** Gasto de las Sesiones con actividad hoy, reutilizado unos segundos (AC-79). */
  private async spending(): Promise<Spending> {
    const ttl = this.options.spendingTtlMs ?? DEFAULT_TTL_MS;
    if (this.cache && Date.now() - this.cache.computedAt < ttl) return this.cache;
    const dayStart = startOfLocalDay(this.clock.now());
    const bySession = new Map<string, SessionEventRow[]>();
    for (const row of this.repository.sessionRows({ since: dayStart.toISOString() })) {
      const rows = bySession.get(row.session_id);
      if (rows) rows.push(row);
      else bySession.set(row.session_id, [row]);
    }
    const sessions = await Promise.all([...bySession.values()].map((rows) => this.spendOf(rows, dayStart)));
    this.cache = { sessions, computedAt: Date.now() };
    return this.cache;
  }

  private async sessionSpend(sessionId: string, dayStart: Date): Promise<SessionSpend | undefined> {
    const rows = this.repository.sessionRowsOf([sessionId]);
    return rows.length === 0 ? undefined : this.spendOf(rows, dayStart);
  }

  private async spendOf(rows: SessionEventRow[], dayStart: Date): Promise<SessionSpend> {
    const pathRow = [...rows].reverse().find((r) => r.transcript_path !== null);
    const entries = pathRow?.transcript_path ? ((await this.transcripts.readUsage(pathRow.transcript_path)) ?? []) : [];
    return {
      session_id: rows[0]!.session_id,
      project: rows.at(-1)!.project,
      lifetime_usd: costOf(entries),
      today_usd: costOf(entries, dayStart),
    };
  }
}
