import type { StoredEvent } from '../domain/event.js';
import type { OtlpConfig } from '../domain/otlp-config.js';
import { buildTurnTrace } from '../domain/otlp-trace.js';
import { summarizeSession, type SessionCore, type SessionEventRow, type Turn } from '../domain/session-summary.js';
import { metaLinksOf, readTranscript } from './list-sessions.js';
import type { Clock, EventRepository, ExportRecord, ExportState, ExportStore, TranscriptReader } from './ports.js';

/** Un Turno se exporta cuando lleva este tiempo terminado, para que su Transcript esté escrito (AC-51). */
export const SETTLE_MS = 5_000;
/** Espera tras cada intento fallido; al cuarto fallo el Turno queda `failed` (AC-51). */
const RETRY_DELAYS_MS = [30_000, 60_000, 120_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const SEND_TIMEOUT_MS = 10_000;
const BATCH = 20;
const RECENT = 50;

export type ExportedTurnView = Omit<ExportRecord, 'next_attempt_at'>;

export interface ExporterStatus {
  enabled: boolean;
  endpoint_host: string | null;
  include_content: boolean;
  enabled_since: string | null;
  counts: Record<ExportState, number>;
  last_exported_at: string | null;
  recent: ExportedTurnView[];
}

interface Candidate {
  core: SessionCore;
  turn: Turn & { ended_at: string };
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).split('\n')[0]!.trim().slice(0, 300);
const settled = (record: ExportRecord | undefined) => record?.state === 'exported' || record?.state === 'failed';

/**
 * Exportación OTLP de los Turnos terminados (AC-49 a AC-52, ADR-0008). Corre en
 * segundo plano, fuera de la ingesta; sin `config` está apagada.
 */
export class ExportTurns {
  private readonly enabledSince: string | null;
  private running = false;
  private dirty = true;

  constructor(
    private readonly repository: EventRepository,
    private readonly transcripts: TranscriptReader,
    private readonly store: ExportStore,
    private readonly clock: Clock,
    private readonly config: OtlpConfig | null,
    private readonly send: typeof fetch,
  ) {
    this.enabledSince = config ? store.enabledSince(clock.now().toISOString()) : null;
  }

  /** Llegó un Evento: puede haber Turnos nuevos que exportar. */
  notify(): void {
    this.dirty = true;
  }

  status(): ExporterStatus {
    return {
      enabled: this.config !== null,
      endpoint_host: this.config?.host ?? null,
      include_content: this.config?.includeContent ?? false,
      enabled_since: this.enabledSince,
      counts: this.store.counts(),
      last_exported_at: this.store.lastExportedAt(),
      recent: this.store.recent(RECENT).map(({ next_attempt_at: _next, ...record }) => record),
    };
  }

  /** Exporta los Turnos que toca. Nunca lanza: un fallo se guarda en el Turno. */
  async tick(): Promise<void> {
    if (!this.config || this.running) return;
    this.running = true;
    try {
      const { ready, waiting } = await this.candidates(this.clock.now());
      // Mientras haya Turnos esperando su hora o su reintento, la próxima vuelta debe volver a mirar.
      this.dirty = waiting || ready.length > BATCH;
      for (const candidate of ready.slice(0, BATCH)) await this.exportTurn(candidate);
    } catch {
      // Un fallo leyendo la base o los Transcripts se reintenta en la siguiente vuelta.
      this.dirty = true;
    } finally {
      this.running = false;
    }
  }

  private async candidates(now: Date): Promise<{ ready: Candidate[]; waiting: boolean }> {
    const since = this.enabledSince!;
    const bySession = new Map<string, SessionEventRow[]>();
    for (const row of this.repository.sessionRows({ since })) {
      const rows = bySession.get(row.session_id);
      if (rows) rows.push(row);
      else bySession.set(row.session_id, [row]);
    }
    const sessions = [...bySession.values()].map((rows) => ({ rows, rough: summarizeSession(rows, now) }));
    const known = this.store.known(sessions.flatMap((s) => s.rough.turns.map((t) => t.prompt_event_id)));

    const ready: Candidate[] = [];
    let waiting = false;
    for (const { rows, rough } of sessions) {
      if (rough.turns.every((t) => settled(known.get(t.prompt_event_id)))) continue;
      // El mtime del Transcript cuenta como actividad: no se da por Huérfana una Sesión que aún escribe.
      const pathRow = [...rows].reverse().find((r) => r.transcript_path !== null);
      const transcript = await readTranscript(this.transcripts, pathRow?.transcript_path ?? null);
      const core = summarizeSession(rows, now, transcript?.mtimeMs, metaLinksOf(transcript));
      const finished = core.state === 'closed' || core.state === 'orphaned';
      for (const turn of core.turns) {
        const record = known.get(turn.prompt_event_id);
        if (settled(record)) continue;
        // Un Turno abierto en una Sesión Cerrada o Huérfana acaba en su último Evento.
        const end = turn.ended_at ?? (finished ? core.last_event_at : null);
        if (end === null || Date.parse(end) < Date.parse(since)) continue;
        const dueAt = record?.next_attempt_at ? Date.parse(record.next_attempt_at) : Date.parse(end) + (turn.ended_at === null ? 0 : SETTLE_MS);
        if (now.getTime() < dueAt) waiting = true;
        else ready.push({ core, turn: { ...turn, ended_at: end } });
      }
    }
    ready.sort((a, b) => Date.parse(a.turn.started_at) - Date.parse(b.turn.started_at));
    return { ready, waiting };
  }

  private async exportTurn({ core, turn }: Candidate): Promise<void> {
    const previous = this.store.known([turn.prompt_event_id]).get(turn.prompt_event_id);
    const attempts = (previous?.attempts ?? 0) + 1;
    const now = this.clock.now();
    const record = (state: ExportState, error: string | null, next: Date | null): ExportRecord => ({
      turn_id: turn.prompt_event_id,
      session_id: core.session_id,
      project: core.project,
      state,
      attempts,
      last_error: error,
      next_attempt_at: next?.toISOString() ?? null,
      updated_at: now.toISOString(),
    });
    try {
      await this.deliver(core, turn);
      this.store.save(record('exported', null, null));
    } catch (error) {
      const message = errorText(error);
      const retry = attempts >= MAX_ATTEMPTS ? null : new Date(now.getTime() + RETRY_DELAYS_MS[attempts - 1]!);
      this.store.save(record(retry === null ? 'failed' : 'pending', message, retry));
    }
  }

  private async deliver(core: SessionCore, turn: Candidate['turn']): Promise<void> {
    const events = this.repository.sessionEvents(core.session_id);
    const start = events.findIndex((e) => e.id === turn.prompt_event_id);
    const inTurn: StoredEvent[] = [];
    for (const e of events.slice(start)) {
      if (e.id !== turn.prompt_event_id && e.subagent_id === null && e.event_type === 'prompt.submitted') break;
      // Lo que llega después del fin del Turno ya no es de este Turno.
      if (Date.parse(e.occurred_at) > Date.parse(turn.ended_at)) break;
      inTurn.push(e);
    }
    const pathEvent = [...events].reverse().find((e) => e.transcript_path !== null);
    const transcript = await readTranscript(this.transcripts, pathEvent?.transcript_path ?? null);
    const request = buildTurnTrace({
      session: core,
      turn: { id: turn.prompt_event_id, index: turn.index, started_at: turn.started_at, ended_at: turn.ended_at },
      events: inTurn,
      main: transcript?.entries ?? [],
      subagents: (transcript?.subagents ?? []).map((s) => ({ agentId: s.agentId, entries: s.entries })),
      includeContent: this.config!.includeContent,
      metaLinks: metaLinksOf(transcript),
    });
    const response = await this.send(this.config!.url, {
      method: 'POST',
      headers: this.config!.headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }

  /** Repite `tick` cada `intervalMs`, pero solo si llegaron Eventos o hay Turnos esperando. */
  start(intervalMs: number): () => void {
    if (!this.config || intervalMs <= 0) return () => {};
    const timer = setInterval(() => {
      if (this.dirty) void this.tick();
    }, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}
