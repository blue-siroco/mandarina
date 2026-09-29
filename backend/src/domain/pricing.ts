// Tarifas fijas por modelo (ADR-0005). USD por millón de tokens; se casan por
// prefijo del id de modelo del Transcript, el más largo primero, para cubrir
// ids con sufijo de fecha (`claude-opus-4-20250514`).
import type { TokenUsage } from './token-usage.js';

export interface Rate {
  input: number;
  output: number;
  cacheRead: number;
}

// La escritura de caché cuesta 1,25× la entrada con TTL de 5 min y 2× con 1 h.
const CACHE_WRITE_5M_FACTOR = 1.25;
const CACHE_WRITE_1H_FACTOR = 2;

const RATES: Record<string, Rate> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-mythos-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-1': { input: 15, output: 75, cacheRead: 1.5 },
  'claude-opus-4-2025': { input: 15, output: 75, cacheRead: 1.5 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-4': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
};

const PREFIXES = Object.keys(RATES).sort((a, b) => b.length - a.length);

export function rateFor(model: string): Rate | undefined {
  const prefix = PREFIXES.find((p) => model.startsWith(p));
  return prefix === undefined ? undefined : RATES[prefix];
}

/** Coste estimado en USD, o `undefined` si el modelo no tiene Tarifa. */
export function estimateCost(model: string, usage: TokenUsage): number | undefined {
  const rate = rateFor(model);
  if (!rate) return undefined;
  const perMillion =
    usage.input * rate.input +
    usage.output * rate.output +
    usage.cache_read * rate.cacheRead +
    usage.cache_creation_5m * rate.input * CACHE_WRITE_5M_FACTOR +
    usage.cache_creation_1h * rate.input * CACHE_WRITE_1H_FACTOR;
  return perMillion / 1_000_000;
}

/** Coste de escribir en caché los tokens de `usage` (AC-70); `null` si el modelo no tiene Tarifa. */
export function estimateWriteCost(model: string, usage: TokenUsage): number | null {
  const rate = rateFor(model);
  if (!rate) return null;
  const perMillion = usage.cache_creation_5m * rate.input * CACHE_WRITE_5M_FACTOR + usage.cache_creation_1h * rate.input * CACHE_WRITE_1H_FACTOR;
  return Math.round(perMillion) / 1_000_000;
}

/** Tarifa aplicada, por millón de tokens y clase de token (AC-38); `null` sin Tarifa. */
export function rateTable(
  model: string,
): { input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number } | null {
  const rate = rateFor(model);
  if (!rate) return null;
  return {
    input: rate.input,
    output: rate.output,
    cache_read: rate.cacheRead,
    cache_write_5m: rate.input * CACHE_WRITE_5M_FACTOR,
    cache_write_1h: rate.input * CACHE_WRITE_1H_FACTOR,
  };
}

/** Coste estimado en USD por clase de token (AC-38); `null` sin Tarifa. */
export function costByClass(
  model: string,
  usage: TokenUsage,
): { input: number; output: number; cache_read: number; cache_creation: number } | null {
  const rate = rateTable(model);
  if (!rate) return null;
  const usd = (tokens: number, perMillion: number) => (tokens * perMillion) / 1_000_000;
  return {
    input: usd(usage.input, rate.input),
    output: usd(usage.output, rate.output),
    cache_read: usd(usage.cache_read, rate.cache_read),
    cache_creation: usd(usage.cache_creation_5m, rate.cache_write_5m) + usd(usage.cache_creation_1h, rate.cache_write_1h),
  };
}
