import { CacheEfficiency } from '../../usage/models/usage-metrics';

/** Puntuación de una Evaluación: +1 (bien) o −1 (mal). */
export type EvaluationScore = 1 | -1;

/** Estado de la Sesión (ver `CONTEXT.md`, AC-14). */
export type SessionState = 'active' | 'idle' | 'orphaned' | 'closed';

/** Actividad de la Sesión: Trabajando / En pausa / Esperando (ADR-0011). */
export type SessionActivity = 'working' | 'paused' | 'waiting';

export type WaitingReason = 'permission' | 'question' | 'idle';

/** Espera de una Sesión Esperando; textos ya enmascarados por el servidor. */
export interface SessionWaiting {
  /** Inicio de la espera: `occurred_at` del primer Evento que la causó. */
  since: Date;
  reason: WaitingReason;
  tool: string | null;
  summary: string | null;
  /** Subagente que espera; `null` si espera el agente principal. */
  subagent: { id: string; type: string | null } | null;
}

export type CurrentTool = { name: string; summary: string | null } | null;

/** Subagente en marcha tal como se muestra en la tarjeta del board. */
export interface LiveSubagent {
  /** `null` en un lanzamiento pendiente de enlazar con su Subagente (AC-33). */
  subagentId: string | null;
  agentType: string | null;
  /** Descripción de su Tarea. */
  description: string | null;
  currentTool: CurrentTool;
}

export interface SessionSummary {
  sessionId: string;
  project: string;
  directory: string;
  harness: string;
  state: SessionState;
  activity: SessionActivity | null;
  /** `null` salvo con `activity = waiting`. */
  waiting: SessionWaiting | null;
  currentTool: CurrentTool;
  model: string | null;
  startedAt: Date;
  lastEventAt: Date;
  lastActivityAt: Date;
  eventCount: number;
  toolCount: number;
  promptCount: number;
  turnCount: number;
  subagentCount: number;
  runningSubagents: number;
  liveSubagents: LiveSubagent[];
  blockCount: number;
  /** Puntuación de la Evaluación de la Sesión (AC-59); `null` sin Evaluación o sin puntuar. */
  evaluationScore: EvaluationScore | null;
  /** Avisos de inyección de severidad alta sin descartar (AC-68). */
  injectionAlerts: number;
  /** El último Bloqueo de la Sesión lo produjo la regla `budget` (AC-84). */
  budgetStopped: boolean;
  activeDurationMs: number;
  clockDurationMs: number;
  /** Eventos por intervalo de 5 min en la última hora. */
  sparkline: number[];
}

export interface SessionList {
  items: SessionSummary[];
  facets: { projects: string[]; directories: string[] };
}

export interface SessionFilter {
  since?: Date;
  states?: SessionState[];
  directory?: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface SessionTurn {
  /** Id del `prompt.submitted` que abre el Turno; identifica el Turno al evaluarlo (AC-54). */
  id: string;
  index: number;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number;
  prompt: string | null;
  toolCount: number;
}

/** Tarea del Subagente (ver `CONTEXT.md`). */
export interface SubagentTask {
  description: string | null;
  prompt: string | null;
}

export type ToolCallStatus = 'ok' | 'error' | 'blocked' | 'running';

export interface SubagentToolCall {
  name: string;
  summary: string | null;
  startedAt: Date;
  status: ToolCallStatus;
}

export interface SessionSubagent {
  /** `subagentId`, o `launch:<toolUseId>` para un lanzamiento pendiente: identifica la fila (`?subagente=`). */
  key: string;
  /** `null` en un lanzamiento pendiente de enlazar con su Subagente (AC-33). */
  subagentId: string | null;
  /** Invocación de `Agent`/`Task` que lo lanzó. */
  toolUseId: string | null;
  agentType: string | null;
  /** Subagente interno del Harness (ver `CONTEXT.md`). */
  internal: boolean;
  startedAt: Date;
  stoppedAt: Date | null;
  durationMs: number;
  toolCount: number;
  model: string | null;
  tokens: TokenUsage | null;
  /** Del Transcript o del lanzamiento; `null` si no hay ninguno. */
  task: SubagentTask | null;
  tools: SubagentToolCall[];
  /** Respuesta final; `null` mientras sigue en marcha o sin Transcript. */
  result: string | null;
}

export interface SessionBlock {
  eventId: string;
  occurredAt: Date;
  subagentId: string | null;
  toolName: string | null;
  summary: string | null;
  rule: string;
  reason: string;
}

/** Causa probable de una Reescritura de caché (AC-70). */
export type CacheRewriteCause = 'expired' | 'model_change' | 'compaction' | 'other';

/** Respuesta que vuelve a escribir en caché casi todo su contexto en lugar de leerlo (AC-70, AC-72). */
export interface CacheRewrite {
  messageId: string;
  /** `null` en el agente principal. */
  subagentId: string | null;
  occurredAt: Date;
  model: string;
  cause: CacheRewriteCause;
  writtenTokens: number;
  /** `null` sin Tarifa. */
  costUsd: number | null;
  gapMs: number | null;
}

export interface SessionDetail extends SessionSummary {
  transcriptAvailable: boolean;
  /** Eficiencia de la caché de la Sesión y sus Subagentes; `null` sin Transcript (AC-72). */
  cache: CacheEfficiency | null;
  cacheRewrites: CacheRewrite[];
  usage: {
    tokens: TokenUsage;
    estimatedCostUsd: number | null;
    requests: number;
    models: string[];
  } | null;
  context: { model: string; used: number; limit: number } | null;
  tools: Array<{ name: string; count: number }>;
  turns: SessionTurn[];
  subagents: SessionSubagent[];
  blocks: SessionBlock[];
}
