import type { StoredEvent } from '../domain/event.js';
import {
  isScannedTool,
  scanInjection,
  sourceOf,
  type InjectionCategory,
  type InjectionSeverity,
} from '../domain/injection.js';
import { MARKER_TYPES } from '../domain/mask-secrets.js';
import type { SessionEventRow } from '../domain/session-summary.js';
import { summarizeToolInput } from '../domain/tool-summary.js';
import type { Clock, DismissalStore, EventRepository } from './ports.js';

export const WARNINGS_LIMIT = 500;
const BATCH = 500;
const FOLLOWED_BY = 3;

/** `InjectionWarning` de `spec/api-spec.yaml` (AC-64). */
export interface InjectionWarning {
  id: string;
  event_id: string;
  session_id: string;
  project: string;
  subagent_id: string | null;
  tool_name: string;
  source: string | null;
  pattern: string;
  category: InjectionCategory;
  severity: InjectionSeverity;
  snippet: string;
  occurred_at: string;
  dismissed: boolean;
  followed_by: Array<{ event_id: string; tool_name: string; summary: string | null }>;
}

/** Aviso de un Evento tal como lo lleva `GET /events` (AC-64). */
export interface EventWarning {
  id: string;
  pattern: string;
  severity: InjectionSeverity;
  dismissed: boolean;
}

export interface WarningFilter {
  since: Date;
  project?: string;
  sessionId?: string;
  severities?: InjectionSeverity[];
  pattern?: string;
  dismissed?: 'true' | 'false' | 'all';
}

export interface WarningList {
  items: InjectionWarning[];
  facets: { projects: string[]; patterns: string[] };
}

export interface MaskingStats {
  since: string;
  totals: Record<string, number>;
  items: Array<{ project: string; total: number; counts: Record<string, number> }>;
}

type Stored = Omit<InjectionWarning, 'dismissed' | 'followed_by'> & { seq: number; received_at: string };

const SEVERITY_RANK: Record<InjectionSeverity, number> = { low: 0, medium: 1, high: 2 };

/**
 * Avisos de inyección de los `tool.post` que leen contenido externo (AC-63, AC-64).
 * Se derivan de los Eventos guardados, pero se escanean una sola vez cada uno: el
 * escáner recuerda hasta qué Evento llegó y en cada consulta solo mira los nuevos.
 */
export class InjectionWarnings {
  private lastSeq = 0;
  private readonly warnings: Stored[] = [];
  private readonly byEvent = new Map<string, Stored[]>();

  constructor(
    private readonly repository: EventRepository,
    private readonly dismissals: DismissalStore,
    private readonly clock: Clock,
  ) {}

  /** Escanea los Eventos llegados desde la última vez. */
  sync(): void {
    for (;;) {
      const batch = this.repository.injectionCandidates(this.lastSeq, BATCH);
      for (const candidate of batch) {
        this.lastSeq = candidate.seq;
        if (!isScannedTool(candidate.tool_name, candidate.tool_input)) continue;
        const found = scanInjection(candidate.response).map((finding): Stored => ({
          id: `${candidate.id}:${finding.pattern}`,
          seq: candidate.seq,
          event_id: candidate.id,
          session_id: candidate.session_id,
          project: candidate.project,
          subagent_id: candidate.subagent_id,
          tool_name: candidate.tool_name,
          source: sourceOf(candidate.tool_name, candidate.tool_input),
          pattern: finding.pattern,
          category: finding.category,
          severity: finding.severity,
          snippet: finding.snippet,
          occurred_at: candidate.occurred_at,
          received_at: candidate.received_at,
        }));
        if (found.length === 0) continue;
        this.warnings.push(...found);
        this.byEvent.set(candidate.id, found);
      }
      if (batch.length < BATCH) return;
    }
  }

  list(filter: WarningFilter): WarningList {
    this.sync();
    const dismissed = this.dismissals.all();
    const since = filter.since.toISOString();
    const inPeriod = this.warnings.filter((w) => w.received_at >= since);
    const wanted = filter.dismissed ?? 'false';
    const selected = inPeriod
      .filter((w) => filter.project === undefined || w.project === filter.project)
      .filter((w) => filter.sessionId === undefined || w.session_id === filter.sessionId)
      .filter((w) => !filter.severities?.length || filter.severities.includes(w.severity))
      .filter((w) => filter.pattern === undefined || w.pattern === filter.pattern)
      .filter((w) => wanted === 'all' || dismissed.has(w.id) === (wanted === 'true'))
      .sort((a, b) => b.seq - a.seq || a.pattern.localeCompare(b.pattern))
      .slice(0, WARNINGS_LIMIT);
    const following = this.followingTools(selected);
    return {
      items: selected.map(({ seq: _seq, received_at: _received, ...w }) => ({
        ...w,
        dismissed: dismissed.has(w.id),
        followed_by: following.get(w.event_id) ?? [],
      })),
      facets: {
        projects: [...new Set(inPeriod.map((w) => w.project))].sort(),
        patterns: [...new Set(inPeriod.map((w) => w.pattern))].sort(),
      },
    };
  }

  /** Descarta un aviso; `false` si no existe. */
  dismiss(id: string): boolean {
    this.sync();
    if (!this.warnings.some((w) => w.id === id)) return false;
    this.dismissals.add(id, this.clock.now().toISOString());
    return true;
  }

  restore(id: string): boolean {
    this.sync();
    if (!this.warnings.some((w) => w.id === id)) return false;
    this.dismissals.remove(id);
    return true;
  }

  /** Los avisos de cada Evento, para `GET /events` y el WebSocket. */
  ofEvents(events: StoredEvent[]): Map<string, EventWarning[]> {
    this.sync();
    const result = new Map<string, EventWarning[]>();
    const relevant = events.filter((e) => this.byEvent.has(e.id));
    if (relevant.length === 0) return result;
    const dismissed = this.dismissals.all();
    for (const event of relevant) {
      result.set(
        event.id,
        this.byEvent.get(event.id)!.map((w) => ({ id: w.id, pattern: w.pattern, severity: w.severity, dismissed: dismissed.has(w.id) })),
      );
    }
    return result;
  }

  /** Avisos de severidad alta sin descartar de cada Sesión (AC-68). */
  alertsBySession(): Map<string, number> {
    this.sync();
    const dismissed = this.dismissals.all();
    const alerts = new Map<string, number>();
    for (const w of this.warnings) {
      if (SEVERITY_RANK[w.severity] < SEVERITY_RANK.high || dismissed.has(w.id)) continue;
      alerts.set(w.session_id, (alerts.get(w.session_id) ?? 0) + 1);
    }
    return alerts;
  }

  /** Marcadores de Enmascarado por Proyecto y tipo desde `since` (AC-65). */
  maskingStats(since: Date): MaskingStats {
    const totals = Object.fromEntries(MARKER_TYPES.map((type) => [type, 0]));
    const items = this.repository
      .maskingCounts(since.toISOString(), MARKER_TYPES)
      .map(({ project, counts }) => ({ project, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total || a.project.localeCompare(b.project));
    for (const item of items) for (const [type, n] of Object.entries(item.counts)) totals[type] = (totals[type] ?? 0) + n;
    return { since: since.toISOString(), totals, items };
  }

  /**
   * Hasta 3 herramientas que el mismo agente invocó a continuación en su Turno (o
   * en su vida, si es un Subagente): lo que hizo con lo que acababa de leer.
   */
  private followingTools(selected: Stored[]): Map<string, InjectionWarning['followed_by']> {
    const result = new Map<string, InjectionWarning['followed_by']>();
    if (selected.length === 0) return result;
    const bySession = new Map<string, SessionEventRow[]>();
    for (const row of this.repository.sessionRowsOf([...new Set(selected.map((w) => w.session_id))])) {
      const rows = bySession.get(row.session_id) ?? [];
      rows.push(row);
      bySession.set(row.session_id, rows);
    }
    for (const warning of selected) {
      if (result.has(warning.event_id)) continue;
      const rows = bySession.get(warning.session_id) ?? [];
      const start = rows.findIndex((r) => r.id === warning.event_id);
      const next: InjectionWarning['followed_by'] = [];
      for (const row of rows.slice(start + 1)) {
        if (next.length >= FOLLOWED_BY) break;
        if (this.endsScope(row, warning.subagent_id)) break;
        if ((row.subagent_id ?? null) !== warning.subagent_id) continue;
        if ((row.event_type !== 'tool.pre' && row.event_type !== 'tool.blocked') || row.tool_name === null) continue;
        const event = this.repository.findById(row.id);
        next.push({ event_id: row.id, tool_name: row.tool_name, summary: event ? summarizeToolInput(row.tool_name, event.payload) : null });
      }
      result.set(warning.event_id, next);
    }
    return result;
  }

  /** El Turno del agente principal acaba con el siguiente prompt o `turn.ended`; el de un Subagente, con su parada. */
  private endsScope(row: SessionEventRow, subagentId: string | null): boolean {
    if (subagentId === null) return row.subagent_id === null && (row.event_type === 'prompt.submitted' || row.event_type === 'turn.ended');
    return row.subagent_id === subagentId && row.event_type === 'subagent.stopped';
  }
}
