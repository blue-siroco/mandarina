export type EventType =
  | 'session.started'
  | 'prompt.submitted'
  | 'tool.pre'
  | 'tool.post'
  | 'subagent.started'
  | 'subagent.stopped'
  | 'turn.ended'
  | 'session.ended'
  | 'tool.blocked'
  | 'permission.requested'
  | 'session.notified';

/** Bloqueo aplicado por una Regla de bloqueo (ADR-0006). */
export interface Block {
  rule: string;
  reason: string;
}

/** Datos del Subagente de un Evento `subagent.*`, derivados por el servidor (AC-34). */
export interface EventSubagent {
  /** Tipo de Subagente. */
  type: string | null;
  /** Descripción de la Tarea del Subagente. */
  description: string | null;
  /** Solo en `subagent.stopped`, si se conoce el inicio. */
  durationMs: number | null;
  internal: boolean;
}

export type InjectionSeverity = 'low' | 'medium' | 'high';

/** Aviso de inyección que sale de un Evento, derivado por el servidor al leer (AC-64). */
export interface EventWarning {
  id: string;
  pattern: string;
  severity: InjectionSeverity;
  dismissed: boolean;
}

/** Evento normalizado tal como lo usa la UI (ver `CONTEXT.md`). */
export interface ObservedEvent {
  id: string;
  harness: string;
  project: string;
  directory: string;
  sessionId: string;
  subagentId: string | null;
  eventType: EventType;
  nativeEventType: string;
  toolName: string | null;
  occurredAt: Date;
  receivedAt: Date;
  transcriptPath: string | null;
  payload: Record<string, unknown>;
  block: Block | null;
  subagent: EventSubagent | null;
  /** Avisos de inyección de este Evento; vacío en casi todos (AC-64). */
  warnings: EventWarning[];
}

/** Consulta de Eventos (`GET /api/v1/events`, AC-17). */
export interface EventQuery {
  limit: number;
  sessionId?: string;
  eventTypes?: EventType[];
  since?: Date;
}

export type LiveConnection = 'connecting' | 'live' | 'offline';

/** Estado de un Presupuesto (AC-77). */
export type BudgetLiveState = 'within' | 'near' | 'exceeded';

/** Un Presupuesto ha cambiado de estado, mensaje `budget.state` del WebSocket (AC-81). */
export interface BudgetStateChange {
  budgetId: string;
  scope: 'session' | 'project_day' | 'global_day';
  project: string | null;
  sessionId: string | null;
  action: 'warn' | 'stop';
  state: BudgetLiveState;
  previousState: BudgetLiveState;
  spentUsd: number;
  limitUsd: number;
}

export type LiveSignal =
  | { kind: 'connection'; connection: LiveConnection }
  | { kind: 'event'; event: ObservedEvent }
  | { kind: 'budget'; change: BudgetStateChange };
