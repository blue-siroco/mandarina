import type { StoredEvent } from '../domain/event.js';
import type { SessionEventRow } from '../domain/session-summary.js';
import { subagentLives, type SubagentLife } from '../domain/subagent-lifecycle.js';
import type { EventWarning, InjectionWarnings } from './injection-warnings.js';
import type { EventPublisher, EventRepository } from './ports.js';

/** `EventSubagent` de `spec/api-spec.yaml` (AC-34). */
export interface EventSubagent {
  type: string | null;
  description: string | null;
  duration_ms: number | null;
  internal: boolean;
}

/** Evento tal como lo sirve la API: con los datos de su Subagente, si es un `subagent.*`, y sus Avisos de inyección (AC-34, AC-64). */
export type DescribedEvent = StoredEvent & { subagent: EventSubagent | null; warnings: EventWarning[] };

const isSubagentEvent = (e: StoredEvent) => e.event_type === 'subagent.started' || e.event_type === 'subagent.stopped';

function describe(event: StoredEvent, lives: SubagentLife[]): EventSubagent {
  const life =
    lives.find((l) => l.start_event_id === event.id || l.stop_event_id === event.id) ??
    lives.find((l) => l.subagent_id === event.subagent_id);
  if (!life) return { type: null, description: null, duration_ms: null, internal: false };
  // Si el fin es lo primero que se sabe del Subagente, su inicio es desconocido.
  const knownStart = life.launch_event_id !== null || life.start_event_id !== null || life.tool_count > 0;
  return {
    type: life.agent_type,
    description: life.description,
    duration_ms:
      event.event_type === 'subagent.stopped' && knownStart
        ? Math.max(0, Date.parse(event.occurred_at) - Date.parse(life.started_at))
        : null,
    internal: life.internal,
  };
}

/**
 * Caso de uso: añade a cada Evento de Subagente su Tipo, su Tarea y su duración
 * (AC-34). Un `subagent.*` no los trae: están en el lanzamiento y en el inicio.
 */
export class DescribeSubagentEvents {
  constructor(
    private readonly repository: EventRepository,
    private readonly injections: InjectionWarnings,
  ) {}

  execute(events: StoredEvent[]): DescribedEvent[] {
    const warnings = this.injections.ofEvents(events);
    const sessionIds = [...new Set(events.filter(isSubagentEvent).map((e) => e.session_id))];
    const rowsBySession = new Map<string, SessionEventRow[]>();
    for (const row of this.repository.sessionRowsOf(sessionIds)) {
      const rows = rowsBySession.get(row.session_id) ?? [];
      rows.push(row);
      rowsBySession.set(row.session_id, rows);
    }
    const lives = new Map([...rowsBySession].map(([id, rows]) => [id, subagentLives(rows)]));
    return events.map((event) => ({
      ...event,
      subagent: isSubagentEvent(event) ? describe(event, lives.get(event.session_id) ?? []) : null,
      warnings: warnings.get(event.id) ?? [],
    }));
  }
}

/** Publicador que difunde cada Evento ya descrito, igual que lo sirve `GET /events`. */
export class DescribingPublisher implements EventPublisher {
  constructor(
    private readonly describer: DescribeSubagentEvents,
    private readonly inner: EventPublisher,
  ) {}

  publish(event: StoredEvent): void {
    this.inner.publish(this.describer.execute([event])[0]!);
  }
}
