import { TokenUsage } from '../../sessions/models/session';

/** Estado de un Lanzamiento (AC-45). */
export type LaunchStatus = 'running' | 'finished' | 'no_response';

/** Cifras de un Tipo de Subagente en el periodo (AC-46). */
export interface AgentTypeSummary {
  /** Tipo de Subagente; `null` agrupa los Lanzamientos sin Tipo conocido. */
  type: string | null;
  launches: number;
  running: number;
  noResponse: number;
  foreground: number;
  background: number;
  durationP50Ms: number | null;
  durationP95Ms: number | null;
  tokens: TokenUsage;
  estimatedCostUsd: number;
  costPerLaunchUsd: number | null;
  toolErrorsPerLaunch: number;
  blocksPerLaunch: number;
  /** Lanzamientos cuyo Subagente tiene una Evaluación con +1 / −1 (AC-59). */
  /** Tasa de acierto de caché con los tokens de todos sus Lanzamientos; `null` sin tokens (AC-73). */
  cacheHitRate: number | null;
  /** Ahorro neto por caché de todos sus Lanzamientos; puede ser negativo (AC-73). */
  cacheSavingsNetUsd: number;
  ratedUp: number;
  ratedDown: number;
  sessions: number;
  projects: string[];
  lastAt: Date | null;
}

/** Un Lanzamiento del Tipo con lo que hizo su Subagente (AC-45). */
export interface AgentLaunch {
  /** `subagentId`, o `launch:<toolUseId>`: el `?subagente=` del detalle de Sesión. */
  key: string;
  sessionId: string;
  project: string;
  subagentId: string | null;
  toolUseId: string | null;
  description: string | null;
  status: LaunchStatus;
  background: boolean;
  startedAt: Date;
  stoppedAt: Date | null;
  durationMs: number;
  toolCount: number;
  toolErrors: number;
  blocks: number;
  model: string | null;
  tokens: TokenUsage | null;
  estimatedCostUsd: number | null;
  /** `null` sin Transcript (AC-73). */
  cacheHitRate: number | null;
  cacheSavingsNetUsd: number | null;
  result: string | null;
}

export interface AgentProfile {
  summary: AgentTypeSummary;
  /** `launcher: null` es el agente principal. */
  launchedBy: Array<{ launcher: string | null; launches: number }>;
  models: Array<{ model: string; launches: number }>;
  tools: Array<{ name: string; calls: number; errors: number; blocks: number }>;
  skills: Array<{ skill: string; invocations: number }>;
  mcpServers: Array<{ server: string; calls: number; errors: number }>;
  testRuns: { total: number; passed: number; failed: number };
  /** El más reciente primero. */
  launches: AgentLaunch[];
}

export interface AgentTypeList {
  /** Ordenados por Lanzamientos. */
  items: AgentTypeSummary[];
  projects: string[];
}

export interface AgentQuery {
  /** Ventana hacia atrás desde ahora; sin ella, todo el histórico. */
  windowMs?: number;
  project?: string;
}
