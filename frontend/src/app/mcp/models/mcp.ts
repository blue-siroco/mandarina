export type McpInvocationStatus = 'ok' | 'error' | 'interrupted' | 'blocked' | 'running' | 'no_response';

/** Invocación de una Herramienta MCP (AC-41). */
export interface McpInvocation {
  id: string;
  eventId: string;
  project: string;
  directory: string;
  sessionId: string;
  subagentId: string | null;
  /** Servidor MCP. */
  server: string;
  /** Ámbito de su configuración; `null` si el Harness no lo envía. */
  scope: string | null;
  /** Herramienta dentro del servidor (`browser_navigate`). */
  tool: string;
  /** Nombre completo (`mcp__playwright__browser_navigate`). */
  toolName: string;
  summary: string | null;
  status: McpInvocationStatus;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
  responseBytes: number | null;
  hasImage: boolean;
  error: string | null;
}

/** Cifras de uso de un Servidor MCP o de una de sus herramientas (AC-42). */
export interface McpUsageStats {
  calls: number;
  ok: number;
  errors: number;
  interrupted: number;
  blocked: number;
  running: number;
  noResponse: number;
  /** `errors / (ok + errors)`; `null` si ninguna terminó. */
  failureRate: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  responseAvgBytes: number | null;
  responseMaxBytes: number | null;
  hasImage: boolean;
  lastAt: Date;
  sessions: number;
}

export interface McpToolUsage extends McpUsageStats {
  tool: string;
  toolName: string;
}

export interface McpServerUsage extends McpUsageStats {
  server: string;
  scopes: string[];
  projects: string[];
  /** Ordenadas por llamadas. */
  tools: McpToolUsage[];
}

/** Herramienta MCP cargada con `ToolSearch` y nunca invocada en su Sesión. */
export interface UnusedDeferredTool {
  sessionId: string;
  toolName: string;
  server: string;
  tool: string;
  loadedAt: Date;
}

export interface McpInvocationList {
  /** La más reciente primero. */
  items: McpInvocation[];
  /** Ordenados por llamadas. */
  servers: McpServerUsage[];
  unusedDeferred: UnusedDeferredTool[];
  projects: string[];
  serverNames: string[];
}

export interface McpQuery {
  /** Ventana hacia atrás desde ahora; sin ella, todo el histórico. */
  windowMs?: number;
  project?: string;
  server?: string;
  sessionId?: string;
}
