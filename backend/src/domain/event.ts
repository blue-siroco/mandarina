// Evento normalizado (ver `CONTEXT.md` y `spec/mvp-fase1.md`).

export const SUPPORTED_SCHEMA_VERSION = 1;

export const EVENT_TYPES = [
  'session.started',
  'prompt.submitted',
  'tool.pre',
  'tool.post',
  'subagent.started',
  'subagent.stopped',
  'turn.ended',
  'session.ended',
  'tool.blocked',
  'permission.requested',
  'session.notified',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** Bloqueo aplicado por una Regla de bloqueo en el Adaptador (ADR-0006). */
export interface Block {
  rule: string;
  reason: string;
}

export interface EventInput {
  schema_version: number;
  harness: string;
  project: string;
  directory: string;
  session_id: string;
  subagent_id?: string | null;
  event_type: EventType;
  native_event_type: string;
  tool_name?: string | null;
  occurred_at: string;
  transcript_path?: string | null;
  payload: Record<string, unknown>;
  /** Solo en `tool.blocked`. */
  block?: Block | null;
}

export interface StoredEvent extends Required<EventInput> {
  id: string;
  received_at: string;
}
