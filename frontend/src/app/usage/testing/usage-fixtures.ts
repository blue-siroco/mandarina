import {
  CacheEfficiencyDto,
  UsageBreakdownDto,
  UsageMetricsDto,
  toCache,
} from '../mappers/usage-metrics.mapper';
import { UsageBreakdown, UsageMetrics } from '../models/usage-metrics';

const OPUS = 'claude-opus-5-5';

/** Eficiencia de la caché del total de `usageMetricsDto()`: ahorra 17,62 $ y hay 3 Reescrituras (AC-71). */
export const cacheDto = (overrides: Partial<CacheEfficiencyDto> = {}): CacheEfficiencyDto => ({
  hit_rate: 0.95,
  read_tokens: 4_700_000,
  write_5m_tokens: 200_000,
  write_1h_tokens: 40_000,
  savings_gross_usd: 17.86,
  write_overhead_usd: 0.24,
  savings_net_usd: 17.62,
  rewrites: 3,
  rewrite_cost_usd: 0.9,
  unpriced_models: [],
  ...overrides,
});

export const cache = (overrides: Partial<CacheEfficiencyDto> = {}) => toCache(cacheDto(overrides))!;

export function usageMetricsDto(overrides: Partial<UsageMetricsDto> = {}): UsageMetricsDto {
  return {
    since: '2026-09-24T22:00:00.000Z',
    generated_at: '2026-09-25T10:00:00.000Z',
    sessions: { total: 6, working: 2, paused: 1, waiting: 0, orphaned: 1, closed: 2 },
    subagents_running: 3,
    tokens: { input: 1200, output: 45_000, cache_read: 4_700_000, cache_creation: 240_000 },
    estimated_cost_usd: 3.4212,
    unpriced_models: [],
    cache: cacheDto(),
    by_model: [
      {
        model: OPUS,
        tokens: { input: 1200, output: 45_000, cache_read: 4_700_000, cache_creation: 240_000 },
        estimated_cost_usd: 3.4212,
      },
    ],
    transcripts: { read: 6, unavailable: 0 },
    breakdown: null,
    ...overrides,
  };
}

export function usageMetrics(overrides: Partial<UsageMetrics> = {}): UsageMetrics {
  return {
    since: new Date('2026-09-24T22:00:00.000Z'),
    generatedAt: new Date('2026-09-25T10:00:00.000Z'),
    sessions: { total: 6, working: 2, paused: 1, waiting: 0, orphaned: 1, closed: 2 },
    subagentsRunning: 3,
    tokens: { input: 1200, output: 45_000, cacheRead: 4_700_000, cacheCreation: 240_000 },
    estimatedCostUsd: 3.4212,
    unpricedModels: [],
    cache: cache(),
    byModel: [
      {
        model: OPUS,
        tokens: { input: 1200, output: 45_000, cacheRead: 4_700_000, cacheCreation: 240_000 },
        estimatedCostUsd: 3.4212,
      },
    ],
    transcripts: { read: 6, unavailable: 0 },
    breakdown: null,
    ...overrides,
  };
}

const DEMO = 'C:\\Codev\\demo';
const LUCIA = 'C:\\Codev\\lucia';

type Counts = [
  working: number,
  paused: number,
  orphaned: number,
  subagents: number,
  calls: number,
  output: number,
  cost: number,
];

/** Caché de una fila del desglose: a más salida, más lectura; las filas sin tokens quedan sin tasa. */
const sliceCacheDto = ([, , , , calls, , output]: Counts): CacheEfficiencyDto =>
  output === 0
    ? cacheDto({
        hit_rate: null,
        read_tokens: 0,
        write_5m_tokens: 0,
        write_1h_tokens: 0,
        savings_gross_usd: 0,
        write_overhead_usd: 0,
        savings_net_usd: 0,
        rewrites: 0,
        rewrite_cost_usd: 0,
      })
    : cacheDto({
        hit_rate: 0.9,
        read_tokens: output * 100,
        write_5m_tokens: output * 5,
        write_1h_tokens: 0,
        savings_gross_usd: output / 1000,
        write_overhead_usd: output / 10_000,
        savings_net_usd: output / 1000 - output / 10_000,
        rewrites: calls > 50 ? 2 : 1,
        rewrite_cost_usd: 0.1,
      });

const sliceDto = (counts: Counts) => {
  const [working, paused, orphaned, subagents, , output, cost] = counts;
  return {
    sessions: { working, paused, orphaned },
    subagents_running: subagents,
    tokens: { input: output / 50, output, cache_read: output * 100, cache_creation: output * 5 },
    estimated_cost_usd: cost,
    unpriced_models: [],
    cache: sliceCacheDto(counts),
  };
};

const slice = (counts: Counts) => {
  const [working, paused, orphaned, subagents, , output, cost] = counts;
  return {
    cache: toCache(sliceCacheDto(counts)),
    sessions: { working, paused, orphaned },
    subagentsRunning: subagents,
    tokens: { input: output / 50, output, cacheRead: output * 100, cacheCreation: output * 5 },
    estimatedCostUsd: cost,
    unpricedModels: [],
  };
};

// Suma el total de `usageMetrics()`: demo con Opus y Haiku, lucia sin Transcript.
const DEMO_COUNTS: Counts = [2, 0, 1, 3, 120, 45_000, 3.4212];
const LUCIA_COUNTS: Counts = [0, 1, 0, 0, 30, 0, 0];
const OPUS_COUNTS: Counts = [2, 0, 1, 0, 100, 40_000, 3.2];
const HAIKU_COUNTS: Counts = [0, 0, 0, 3, 20, 5_000, 0.2212];

export function breakdownDto(): UsageBreakdownDto {
  return {
    by_directory: [
      {
        ...sliceDto(DEMO_COUNTS),
        directory: DEMO,
        project: 'demo',
        main_model: OPUS,
        transcripts_unavailable: 0,
      },
      {
        ...sliceDto(LUCIA_COUNTS),
        directory: LUCIA,
        project: 'lucia',
        main_model: null,
        transcripts_unavailable: 1,
      },
    ],
    by_model: [
      {
        ...sliceDto(OPUS_COUNTS),
        model: OPUS,
        rate: { input: 4, output: 20, cache_read: 0.2, cache_write_5m: 5, cache_write_1h: 8 },
        cost_breakdown: { input: 0.1, output: 0.8, cache_read: 0.8, cache_creation: 1.5 },
      },
      {
        ...sliceDto(HAIKU_COUNTS),
        model: 'claude-haiku-4-5',
        rate: { input: 1, output: 5, cache_read: 0.1, cache_write_5m: 1.25, cache_write_1h: 2 },
        cost_breakdown: { input: 0.01, output: 0.02, cache_read: 0.05, cache_creation: 0.1412 },
      },
      { ...sliceDto(LUCIA_COUNTS), model: null, rate: null, cost_breakdown: null },
    ],
  };
}

export function breakdown(): UsageBreakdown {
  return {
    byDirectory: [
      {
        ...slice(DEMO_COUNTS),
        directory: DEMO,
        project: 'demo',
        mainModel: OPUS,
        transcriptsUnavailable: 0,
      },
      {
        ...slice(LUCIA_COUNTS),
        directory: LUCIA,
        project: 'lucia',
        mainModel: null,
        transcriptsUnavailable: 1,
      },
    ],
    byModel: [
      {
        ...slice(OPUS_COUNTS),
        model: OPUS,
        rate: { input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 5, cacheWrite1h: 8 },
        costBreakdown: { input: 0.1, output: 0.8, cacheRead: 0.8, cacheCreation: 1.5 },
      },
      {
        ...slice(HAIKU_COUNTS),
        model: 'claude-haiku-4-5',
        rate: { input: 1, output: 5, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2 },
        costBreakdown: { input: 0.01, output: 0.02, cacheRead: 0.05, cacheCreation: 0.1412 },
      },
      { ...slice(LUCIA_COUNTS), model: null, rate: null, costBreakdown: null },
    ],
  };
}
