import { Block, EventType, EventWarning, ObservedEvent } from '../models/observed-event';

/** Evento tal como lo devuelve la API (`spec/api-spec.yaml#/components/schemas/Event`). */
export interface EventDto {
  id: string;
  schema_version: number;
  harness: string;
  project: string;
  directory: string;
  session_id: string;
  subagent_id: string | null;
  event_type: EventType;
  native_event_type: string;
  tool_name: string | null;
  occurred_at: string;
  received_at: string;
  transcript_path: string | null;
  payload: Record<string, unknown>;
  /** Opcional para aceptar backends anteriores a la rebanada 4. */
  block?: Block | null;
  /** Opcional para aceptar backends anteriores a la rebanada 7. */
  subagent?: { type: string | null; description: string | null; duration_ms: number | null; internal: boolean } | null;
  /** Opcional para aceptar backends anteriores a la rebanada 13 (AC-64). */
  warnings?: EventWarning[];
}

export function toObservedEvent(dto: EventDto): ObservedEvent {
  return {
    id: dto.id,
    harness: dto.harness,
    project: dto.project,
    directory: dto.directory,
    sessionId: dto.session_id,
    subagentId: dto.subagent_id,
    eventType: dto.event_type,
    nativeEventType: dto.native_event_type,
    toolName: dto.tool_name,
    occurredAt: new Date(dto.occurred_at),
    receivedAt: new Date(dto.received_at),
    transcriptPath: dto.transcript_path,
    payload: dto.payload,
    block: dto.block ?? null,
    subagent: dto.subagent
      ? { type: dto.subagent.type, description: dto.subagent.description, durationMs: dto.subagent.duration_ms, internal: dto.subagent.internal }
      : null,
    warnings: (dto.warnings ?? []).map((w) => ({ id: w.id, pattern: w.pattern, severity: w.severity, dismissed: w.dismissed })),
  };
}
