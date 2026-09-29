// Desglose de las fichas por Directorio y por modelo (AC-38). Cada Sesión
// aporta contribuciones atribuidas a un Directorio y a un modelo; el total y
// cada fila de un desglose son la suma de sus contribuciones, así que cuadran.
import type { CacheRewrite } from './cache-efficiency.js';
import { estimateCost } from './pricing.js';
import { addUsage, ZERO_USAGE, type TokenUsage, type UsageEntry } from './token-usage.js';

export interface Contribution {
  directory: string;
  project: string;
  /** Modelo en uso; `null` si no se conoce (sin Transcript, Subagente pendiente). */
  model: string | null;
  working: number;
  paused: number;
  orphaned: number;
  subagents_running: number;
  tool_calls: number;
  prompts: number;
  blocks: number;
  /** Tokens de respuestas de `model`. */
  usage?: TokenUsage;
  /** La respuesta de `usage` es una Reescritura de caché (AC-70). */
  rewrite?: CacheRewrite;
}

export interface Slice {
  sessions: { working: number; paused: number; orphaned: number };
  subagents_running: number;
  activity: { tool_calls: number; prompts: number; blocks: number };
  tokens: TokenUsage;
  /** Tokens por modelo, para el coste y el modelo principal. */
  usage_by_model: Map<string, TokenUsage>;
  estimated_cost_usd: number;
  unpriced_models: string[];
  /** El de más tokens de salida. */
  main_model: string | null;
  /** Reescrituras de caché y lo que costó escribirlas (AC-71). */
  cache_rewrites: number;
  cache_rewrite_cost_usd: number;
}

const ms = (iso: string) => Date.parse(iso);

/**
 * Modelo en uso en `at`: el de la respuesta anterior o, si aún no había
 * ninguna (un prompt que abre la Sesión), el de la siguiente.
 */
export function modelAt(entries: UsageEntry[], at: string): string | null {
  const t = ms(at);
  let before: UsageEntry | undefined;
  let after: UsageEntry | undefined;
  for (const entry of entries) {
    const e = ms(entry.timestamp);
    if (e <= t && (!before || e > ms(before.timestamp))) before = entry;
    if (e > t && (!after || e < ms(after.timestamp))) after = entry;
  }
  return (before ?? after)?.model ?? null;
}

export function aggregate(contributions: Iterable<Contribution>): Slice {
  const slice: Slice = {
    sessions: { working: 0, paused: 0, orphaned: 0 },
    subagents_running: 0,
    activity: { tool_calls: 0, prompts: 0, blocks: 0 },
    tokens: ZERO_USAGE,
    usage_by_model: new Map(),
    estimated_cost_usd: 0,
    unpriced_models: [],
    main_model: null,
    cache_rewrites: 0,
    cache_rewrite_cost_usd: 0,
  };
  for (const c of contributions) {
    slice.sessions.working += c.working;
    slice.sessions.paused += c.paused;
    slice.sessions.orphaned += c.orphaned;
    slice.subagents_running += c.subagents_running;
    slice.activity.tool_calls += c.tool_calls;
    slice.activity.prompts += c.prompts;
    slice.activity.blocks += c.blocks;
    if (c.rewrite) {
      slice.cache_rewrites += 1;
      slice.cache_rewrite_cost_usd += c.rewrite.cost_usd ?? 0;
    }
    if (c.usage && c.model !== null) {
      slice.tokens = addUsage(slice.tokens, c.usage);
      slice.usage_by_model.set(c.model, addUsage(slice.usage_by_model.get(c.model) ?? ZERO_USAGE, c.usage));
    }
  }
  let mainOutput = -1;
  for (const [model, usage] of slice.usage_by_model) {
    const cost = estimateCost(model, usage);
    if (cost === undefined) slice.unpriced_models.push(model);
    else slice.estimated_cost_usd += cost;
    if (usage.output > mainOutput) {
      mainOutput = usage.output;
      slice.main_model = model;
    }
  }
  slice.unpriced_models.sort();
  return slice;
}

/** Agrupa las contribuciones por una clave y suma cada grupo. */
export function aggregateBy<K>(contributions: Contribution[], keyOf: (c: Contribution) => K): Map<K, Slice> {
  const groups = new Map<K, Contribution[]>();
  for (const c of contributions) {
    const key = keyOf(c);
    const group = groups.get(key);
    if (group) group.push(c);
    else groups.set(key, [c]);
  }
  return new Map([...groups].map(([key, group]) => [key, aggregate(group)]));
}
