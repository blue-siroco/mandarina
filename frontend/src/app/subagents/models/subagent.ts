import { TokenUsage } from '../../sessions/models/session';

/** Estado de un Lanzamiento (AC-45). */
export type SubagentStatus = 'running' | 'finished' | 'no_response';

/** Subagente de la pantalla Subagentes (AC-35). */
export interface SubagentItem {
  /** `subagentId`, o `launch:<toolUseId>` para un lanzamiento pendiente; es el `?subagente=` del detalle. */
  key: string;
  sessionId: string;
  project: string;
  directory: string;
  subagentId: string | null;
  toolUseId: string | null;
  /** Tipo de Subagente. */
  agentType: string | null;
  /** Descripción de su Tarea. */
  description: string | null;
  internal: boolean;
  status: SubagentStatus;
  startedAt: Date;
  stoppedAt: Date | null;
  durationMs: number;
  toolCount: number;
  model: string | null;
  tokens: TokenUsage | null;
  estimatedCostUsd: number | null;
}

export interface SubagentList {
  /** El más reciente primero. */
  items: SubagentItem[];
  projects: string[];
  types: string[];
}

export interface SubagentQuery {
  /** Ventana hacia atrás desde ahora; sin ella, todo el histórico. */
  windowMs?: number;
  project?: string;
  type?: string;
  includeInternal?: boolean;
}
