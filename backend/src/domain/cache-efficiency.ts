// Eficiencia de la caché de prompts (AC-69, AC-70; roadmap §1.14). Se deriva del Uso
// de tokens del Transcript y de las Tarifas (ADR-0005), sin Tipo de evento nuevo.
import { estimateWriteCost, rateFor } from './pricing.js';
import type { TokenUsage, UsageEntry } from './token-usage.js';

/** Multiplicador sobre la Tarifa de entrada que se paga de más al escribir en caché (ADR-0005). */
const WRITE_5M_OVERHEAD = 0.25;
const WRITE_1H_OVERHEAD = 1;
const FIVE_MINUTES_MS = 5 * 60_000;
const ONE_HOUR_MS = 60 * 60_000;

/** `CacheEfficiency` de `spec/api-spec.yaml`. */
export interface CacheEfficiency {
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

export type CacheRewriteCause = 'expired' | 'model_change' | 'compaction' | 'other';

/** `CacheRewrite` de `spec/api-spec.yaml`. */
export interface CacheRewrite {
  message_id: string;
  subagent_id: string | null;
  occurred_at: string;
  model: string;
  cause: CacheRewriteCause;
  written_tokens: number;
  cost_usd: number | null;
  gap_ms: number | null;
}

// Evita arrastrar decimales de coma flotante hasta la UI.
const round = (usd: number) => Math.round(usd * 1e6) / 1e6;

/** Eficiencia de las respuestas agrupadas por modelo; las Reescrituras (AC-70) se suman aparte. */
export function cacheEfficiency(
  usageByModel: ReadonlyMap<string, TokenUsage>,
  rewrites: { count: number; cost_usd: number } = { count: 0, cost_usd: 0 },
): CacheEfficiency {
  let input = 0;
  let read = 0;
  let write5m = 0;
  let write1h = 0;
  let gross = 0;
  let overhead = 0;
  const unpriced: string[] = [];
  for (const [model, usage] of usageByModel) {
    input += usage.input;
    read += usage.cache_read;
    write5m += usage.cache_creation_5m;
    write1h += usage.cache_creation_1h;
    const rate = rateFor(model);
    if (!rate) {
      if (usage.cache_read + usage.cache_creation_5m + usage.cache_creation_1h > 0) unpriced.push(model);
      continue;
    }
    gross += (usage.cache_read * (rate.input - rate.cacheRead)) / 1_000_000;
    overhead += (usage.cache_creation_5m * rate.input * WRITE_5M_OVERHEAD + usage.cache_creation_1h * rate.input * WRITE_1H_OVERHEAD) / 1_000_000;
  }
  const inputSide = input + read + write5m + write1h;
  return {
    hit_rate: inputSide === 0 ? null : read / inputSide,
    read_tokens: read,
    write_5m_tokens: write5m,
    write_1h_tokens: write1h,
    savings_gross_usd: round(gross),
    write_overhead_usd: round(overhead),
    savings_net_usd: round(gross - overhead),
    rewrites: rewrites.count,
    rewrite_cost_usd: round(rewrites.cost_usd),
    unpriced_models: unpriced.sort(),
  };
}

/** TTL de la clase de escritura predominante de una respuesta. */
const ttlOf = (usage: TokenUsage) => (usage.cache_creation_1h > usage.cache_creation_5m ? ONE_HOUR_MS : FIVE_MINUTES_MS);

/**
 * Reescrituras de caché de un agente: `entries` son sus respuestas (sin importar el
 * orden ni los repetidos) y `subagentId`, el agente (`null` el principal).
 */
export function cacheRewrites(entries: readonly UsageEntry[], subagentId: string | null): CacheRewrite[] {
  const ordered = [...new Map(entries.map((e) => [e.messageId, e])).values()].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  const rewrites: CacheRewrite[] = [];
  ordered.forEach((entry, index) => {
    const previous = ordered[index - 1];
    if (!previous) return;
    const { usage } = entry;
    const written = usage.cache_creation_5m + usage.cache_creation_1h;
    if (written === 0 || written * 2 <= usage.input + usage.cache_read + written) return;
    const gap = Date.parse(entry.timestamp) - Date.parse(previous.timestamp);
    let cause: CacheRewriteCause = 'other';
    if (previous.model !== entry.model) cause = 'model_change';
    else if (gap > ttlOf(usage)) cause = 'expired';
    rewrites.push({
      message_id: entry.messageId,
      subagent_id: subagentId,
      occurred_at: entry.timestamp,
      model: entry.model,
      cause,
      written_tokens: written,
      cost_usd: estimateWriteCost(entry.model, usage),
      gap_ms: gap,
    });
  });
  return rewrites;
}
