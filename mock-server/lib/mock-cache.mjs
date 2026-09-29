// Eficiencia de la caché simulada (AC-69 a AC-73). Mismas fórmulas que
// `backend/src/domain/cache-efficiency.ts`, sobre los tokens sintéticos del mock:
// toda la escritura de caché es de 5 min y unas pocas respuestas son Reescrituras.

// Subconjunto de la tabla del backend (ADR-0005), USD por millón de tokens.
const RATES = {
  'claude-opus-5-5': { input: 4, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, cacheRead: 0.2 },
  'claude-haiku-4-5': { input: 1, cacheRead: 0.1 },
};

const CAUSES = ['expired', 'model_change', 'other'];
const REWRITE_ONE_IN = 11;

const rateOf = (model) => Object.entries(RATES).find(([prefix]) => model?.startsWith(prefix))?.[1];
const round = (usd) => Math.round(usd * 1e6) / 1e6;
const hashOf = (event) => [...event.id].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 997, 7);

/** Una de cada once respuestas simuladas vuelve a escribir su contexto en caché. */
export const isRewrite = (event) => hashOf(event) % REWRITE_ONE_IN === 0;
export const rewriteCause = (event) => CAUSES[hashOf(event) % CAUSES.length];

/** Coste de escribir en caché los tokens de una respuesta; `null` sin Tarifa. */
export function writeCost(model, tokens) {
  const rate = rateOf(model);
  return rate ? round((tokens.cache_creation * rate.input * 1.25) / 1e6) : null;
}

/**
 * @param {Map<string, { input: number, output: number, cache_read: number, cache_creation: number }>} byModel
 * @param {{ count: number, cost_usd: number }} rewrites
 */
export function cacheView(byModel, rewrites = { count: 0, cost_usd: 0 }) {
  let input = 0;
  let read = 0;
  let written = 0;
  let gross = 0;
  let overhead = 0;
  const unpriced = [];
  for (const [model, t] of byModel) {
    input += t.input;
    read += t.cache_read;
    written += t.cache_creation;
    const rate = rateOf(model);
    if (!rate) {
      if (t.cache_read + t.cache_creation > 0) unpriced.push(model);
      continue;
    }
    gross += (t.cache_read * (rate.input - rate.cacheRead)) / 1e6;
    overhead += (t.cache_creation * rate.input * 0.25) / 1e6;
  }
  const side = input + read + written;
  return {
    hit_rate: side === 0 ? null : read / side,
    read_tokens: read,
    write_5m_tokens: written,
    write_1h_tokens: 0,
    savings_gross_usd: round(gross),
    write_overhead_usd: round(overhead),
    savings_net_usd: round(gross - overhead),
    rewrites: rewrites.count,
    rewrite_cost_usd: round(rewrites.cost_usd),
    unpriced_models: unpriced.sort(),
  };
}
