/** Uso de tokens (ver `CONTEXT.md`). */
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface ModelUsage {
  model: string;
  tokens: TokenUsage;
  /** `null` si el modelo no tiene Tarifa. */
  estimatedCostUsd: number | null;
}

/** Eficiencia de la caché de prompts de un conjunto de respuestas (AC-69, AC-71). */
export interface CacheEfficiency {
  /** `null` sin tokens de entrada. */
  hitRate: number | null;
  readTokens: number;
  write5mTokens: number;
  write1hTokens: number;
  savingsGrossUsd: number;
  writeOverheadUsd: number;
  /** Puede ser negativo: se escribió más de lo que se releyó. */
  savingsNetUsd: number;
  rewrites: number;
  rewriteCostUsd: number;
  unpricedModels: string[];
}

/** Las cifras de las fichas para una parte de la ventana (AC-38). */
export interface MetricsSlice {
  sessions: { working: number; paused: number; orphaned: number };
  subagentsRunning: number;
  activity: { toolCalls: number; prompts: number; blocks: number };
  tokens: TokenUsage;
  /** Sin los modelos sin Tarifa. */
  estimatedCostUsd: number;
  unpricedModels: string[];
  /** `null` con un backend anterior a la rebanada 14. */
  cache: CacheEfficiency | null;
}

export interface DirectoryBreakdown extends MetricsSlice {
  directory: string;
  project: string;
  /** El de más tokens de salida. */
  mainModel: string | null;
  transcriptsUnavailable: number;
}

/** Tarifa aplicada, USD por millón de tokens (ADR-0005). */
export interface AppliedRate {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

export interface ModelBreakdown extends MetricsSlice {
  /** `null` agrupa lo que no tiene modelo conocido. */
  model: string | null;
  rate: AppliedRate | null;
  costBreakdown: { input: number; output: number; cacheRead: number; cacheCreation: number } | null;
}

export interface UsageBreakdown {
  byDirectory: DirectoryBreakdown[];
  byModel: ModelBreakdown[];
}

/** Qué pedir además de la ventana (AC-38). */
export interface UsageQuery {
  /** Solo las Sesiones de este Directorio, como el filtro del board. */
  directory?: string;
  breakdown?: boolean;
}

/** Fichas de uso de una ventana de tiempo (AC-11, AC-12). */
export interface UsageMetrics {
  since: Date;
  generatedAt: Date;
  sessions: { total: number; working: number; paused: number; orphaned: number; closed: number };
  subagentsRunning: number;
  activity: { events: number; toolCalls: number; prompts: number; blocks: number };
  tokens: TokenUsage;
  estimatedCostUsd: number;
  unpricedModels: string[];
  /** `null` con un backend anterior a la rebanada 14. */
  cache: CacheEfficiency | null;
  byModel: ModelUsage[];
  transcripts: { read: number; unavailable: number };
  /** Solo si se pidió (AC-38). */
  breakdown: UsageBreakdown | null;
}
