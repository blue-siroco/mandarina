import { CacheEfficiency, MetricsSlice, TokenUsage, UsageBreakdown, UsageMetrics } from '../models/usage-metrics';

/** `TokenUsage` de `spec/api-spec.yaml`. */
export interface TokenUsageDto {
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
}

/** `CacheEfficiency` de `spec/api-spec.yaml`. */
export interface CacheEfficiencyDto {
  hit_rate: number | null;
  read_tokens: number;
  write_5m_tokens: number;
  write_1h_tokens: number;
  savings_gross_usd: number;
  write_overhead_usd: number;
  savings_net_usd: number;
  rewrites: number;
  rewrite_cost_usd: number;
  unpriced_models: string[];
}

/** `MetricsSlice` de `spec/api-spec.yaml`. */
interface MetricsSliceDto {
  sessions: { working: number; paused: number; orphaned: number };
  subagents_running: number;
  activity: { tool_calls: number; prompts: number; blocks: number };
  tokens: TokenUsageDto;
  estimated_cost_usd: number;
  unpriced_models: string[];
  /** Opcional para aceptar backends anteriores a la rebanada 14. */
  cache?: CacheEfficiencyDto | null;
}

/** `breakdown` de `UsageMetrics` en `spec/api-spec.yaml`. */
export interface UsageBreakdownDto {
  by_directory: Array<
    MetricsSliceDto & {
      directory: string;
      project: string;
      main_model: string | null;
      transcripts_unavailable: number;
    }
  >;
  by_model: Array<
    MetricsSliceDto & {
      model: string | null;
      rate: {
        input: number;
        output: number;
        cache_read: number;
        cache_write_5m: number;
        cache_write_1h: number;
      } | null;
      cost_breakdown: {
        input: number;
        output: number;
        cache_read: number;
        cache_creation: number;
      } | null;
    }
  >;
}

/** `UsageMetrics` de `spec/api-spec.yaml`. */
export interface UsageMetricsDto {
  since: string;
  generated_at: string;
  /** `waiting` opcional para aceptar backends anteriores a la rebanada 16. */
  sessions: {
    total: number;
    working: number;
    paused: number;
    waiting?: number;
    orphaned: number;
    closed: number;
  };
  subagents_running: number;
  activity: { events: number; tool_calls: number; prompts: number; blocks: number };
  tokens: TokenUsageDto;
  estimated_cost_usd: number;
  unpriced_models: string[];
  /** Opcional para aceptar backends anteriores a la rebanada 14. */
  cache?: CacheEfficiencyDto | null;
  by_model: Array<{ model: string; tokens: TokenUsageDto; estimated_cost_usd: number | null }>;
  transcripts: { read: number; unavailable: number };
  /** Opcional para aceptar backends anteriores a la rebanada 8. */
  breakdown?: UsageBreakdownDto | null;
}

const toTokenUsage = (dto: TokenUsageDto): TokenUsage => ({
  input: dto.input,
  output: dto.output,
  cacheRead: dto.cache_read,
  cacheCreation: dto.cache_creation,
});

export function toCache(dto: CacheEfficiencyDto | null | undefined): CacheEfficiency | null {
  if (!dto) return null;
  return {
    hitRate: dto.hit_rate,
    readTokens: dto.read_tokens,
    write5mTokens: dto.write_5m_tokens,
    write1hTokens: dto.write_1h_tokens,
    savingsGrossUsd: dto.savings_gross_usd,
    writeOverheadUsd: dto.write_overhead_usd,
    savingsNetUsd: dto.savings_net_usd,
    rewrites: dto.rewrites,
    rewriteCostUsd: dto.rewrite_cost_usd,
    unpricedModels: [...dto.unpriced_models],
  };
}

function toSlice(dto: MetricsSliceDto): MetricsSlice {
  return {
    sessions: { ...dto.sessions },
    subagentsRunning: dto.subagents_running,
    activity: {
      toolCalls: dto.activity.tool_calls,
      prompts: dto.activity.prompts,
      blocks: dto.activity.blocks,
    },
    tokens: toTokenUsage(dto.tokens),
    estimatedCostUsd: dto.estimated_cost_usd,
    unpricedModels: [...dto.unpriced_models],
    cache: toCache(dto.cache),
  };
}

export function toBreakdown(dto: UsageBreakdownDto): UsageBreakdown {
  return {
    byDirectory: dto.by_directory.map((d) => ({
      ...toSlice(d),
      directory: d.directory,
      project: d.project,
      mainModel: d.main_model,
      transcriptsUnavailable: d.transcripts_unavailable,
    })),
    byModel: dto.by_model.map((m) => ({
      ...toSlice(m),
      model: m.model,
      rate: m.rate && {
        input: m.rate.input,
        output: m.rate.output,
        cacheRead: m.rate.cache_read,
        cacheWrite5m: m.rate.cache_write_5m,
        cacheWrite1h: m.rate.cache_write_1h,
      },
      costBreakdown: m.cost_breakdown && {
        input: m.cost_breakdown.input,
        output: m.cost_breakdown.output,
        cacheRead: m.cost_breakdown.cache_read,
        cacheCreation: m.cost_breakdown.cache_creation,
      },
    })),
  };
}

export function toUsageMetrics(dto: UsageMetricsDto): UsageMetrics {
  return {
    since: new Date(dto.since),
    generatedAt: new Date(dto.generated_at),
    sessions: { ...dto.sessions, waiting: dto.sessions.waiting ?? 0 },
    subagentsRunning: dto.subagents_running,
    activity: {
      events: dto.activity.events,
      toolCalls: dto.activity.tool_calls,
      prompts: dto.activity.prompts,
      blocks: dto.activity.blocks,
    },
    tokens: toTokenUsage(dto.tokens),
    estimatedCostUsd: dto.estimated_cost_usd,
    unpricedModels: [...dto.unpriced_models],
    cache: toCache(dto.cache),
    byModel: dto.by_model.map((m) => ({
      model: m.model,
      tokens: toTokenUsage(m.tokens),
      estimatedCostUsd: m.estimated_cost_usd,
    })),
    transcripts: { ...dto.transcripts },
    breakdown: dto.breakdown ? toBreakdown(dto.breakdown) : null,
  };
}
