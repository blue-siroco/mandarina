// Imitación de `GET /api/v1/metrics` (AC-11, AC-12) sobre los Eventos en memoria.
// El mock no tiene Transcripts: el Uso de tokens se sintetiza por Evento de
// forma determinista, con el modelo que anunció el `SessionStart`.

import { isClosed } from './mock-closed.mjs';
import { cacheView, isRewrite, writeCost } from './mock-cache.mjs';
import { subagentLives } from './mock-subagents.mjs';
import { currentWait, lastProgress } from './mock-waiting.mjs';

const ORPHAN_AFTER_MS = 30 * 60 * 1000;
const IDLE_AFTER = new Set(['session.started', 'turn.ended']);

// Subconjunto de la tabla del backend (ADR-0005), USD por millón de tokens.
const RATES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
};

// Una respuesta del modelo por cada herramienta y cada fin de Turno.
const REPLY_EVENTS = new Set(['tool.post', 'turn.ended']);

export function syntheticUsage(event) {
  const n = [...event.id].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 997, 7);
  return { input: 2 + (n % 40), output: 80 + n * 3, cache_read: 8000 + n * 60, cache_creation: 300 + n * 4 };
}

export function costOf(model, t) {
  const rate = Object.entries(RATES).find(([prefix]) => model.startsWith(prefix))?.[1];
  if (!rate) return null;
  return (t.input * rate.input + t.output * rate.output + t.cache_read * rate.cacheRead + t.cache_creation * rate.input * 1.25) / 1e6;
}

const zero = () => ({ input: 0, output: 0, cache_read: 0, cache_creation: 0 });
const add = (a, b) => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cache_read: a.cache_read + b.cache_read,
  cache_creation: a.cache_creation + b.cache_creation,
});
const round = (usd) => Math.round(usd * 1e6) / 1e6;

// En el mock los Subagentes responden siempre con Haiku; la Sesión, con el modelo de su `SessionStart`.
export const SUBAGENT_MODEL = 'claude-haiku-4-5';

function rateTable(model) {
  const rate = Object.entries(RATES).find(([prefix]) => model?.startsWith(prefix))?.[1];
  return rate ? { input: rate.input, output: rate.output, cache_read: rate.cacheRead, cache_write_5m: rate.input * 1.25, cache_write_1h: rate.input * 2 } : null;
}

const emptyCounts = () => ({ working: 0, paused: 0, orphaned: 0, subagents_running: 0 });

/** Suma contribuciones { directory, project, model, ...conteos, tokens? } en un corte (AC-38). */
function aggregate(contributions) {
  const counts = emptyCounts();
  const byModel = new Map();
  const rewrites = { count: 0, cost_usd: 0 };
  for (const c of contributions) {
    for (const k of Object.keys(counts)) counts[k] += c[k] ?? 0;
    if (c.tokens && c.model) byModel.set(c.model, add(byModel.get(c.model) ?? zero(), c.tokens));
    if (c.rewrite && c.tokens && c.model) {
      rewrites.count += 1;
      rewrites.cost_usd += writeCost(c.model, c.tokens) ?? 0;
    }
  }
  let cost = 0;
  const unpriced = [];
  let main = null;
  for (const [model, tokens] of byModel) {
    const c = costOf(model, tokens);
    if (c === null) unpriced.push(model);
    else cost += c;
    if (!main || tokens.output > byModel.get(main).output) main = model;
  }
  return {
    slice: {
      sessions: { working: counts.working, paused: counts.paused, orphaned: counts.orphaned },
      subagents_running: counts.subagents_running,
      tokens: [...byModel.values()].reduce(add, zero()),
      estimated_cost_usd: round(cost),
      unpriced_models: unpriced.sort(),
      cache: cacheView(byModel, rewrites),
    },
    byModel,
    main,
  };
}

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

/**
 * Imitación de `GET /api/v1/metrics` (AC-11, AC-12, AC-38).
 * @param {Array<object>} events Más antiguo primero.
 * @param {Date} since
 * @param {Date} now
 * @param {{ directory?: string, breakdown?: boolean }} options
 */
export function computeMetrics(events, since, now, { directory, breakdown = false } = {}) {
  const sinceIso = since.toISOString();
  const bySession = new Map();
  for (const event of events) {
    const session = bySession.get(event.session_id) ?? { events: [], model: 'claude-opus-5-5' };
    session.events.push(event);
    if (event.event_type === 'session.started' && typeof event.payload?.model === 'string') session.model = event.payload.model;
    bySession.set(event.session_id, session);
  }

  const sessions = { total: 0, working: 0, paused: 0, waiting: 0, orphaned: 0, closed: 0 };
  const contributions = [];
  let eventCount = 0;
  for (const { events: own, model } of bySession.values()) {
    const last = own.at(-1);
    if (last.received_at < sinceIso || (directory && last.directory !== directory)) continue;
    const base = { directory: last.directory, project: last.project };
    sessions.total += 1;
    let condition;
    if (isClosed(own)) condition = 'closed';
    else if (now - Date.parse(last.received_at) > ORPHAN_AFTER_MS) condition = 'orphaned';
    else if (currentWait(own)) condition = 'waiting';
    else condition = IDLE_AFTER.has(lastProgress(own).event_type) ? 'paused' : 'working';
    sessions[condition] += 1;
    // `MetricsSlice.sessions` no tiene Esperando: en los desgloses no suma a Trabajando ni a En pausa.
    if (condition !== 'closed') contributions.push({ ...base, model, ...(condition === 'waiting' ? {} : { [condition]: 1 }) });
    if (condition === 'working' || condition === 'waiting') {
      // Con los lanzamientos pendientes y sin los internos (AC-34).
      for (const life of subagentLives(own).filter((l) => !l.internal && l.stopped_at === null)) {
        contributions.push({ ...base, model: life.subagent_id ? SUBAGENT_MODEL : null, subagents_running: 1 });
      }
    }
    for (const e of own) {
      if (e.received_at < sinceIso) continue;
      eventCount += 1;
      const at = e.subagent_id ? SUBAGENT_MODEL : model;
      if (REPLY_EVENTS.has(e.event_type)) contributions.push({ ...base, model: at, tokens: syntheticUsage(e), rewrite: isRewrite(e) });
    }
  }

  const total = aggregate(contributions);
  const models = [...total.byModel].map(([model, tokens]) => {
    const cost = costOf(model, tokens);
    return { model, tokens, estimated_cost_usd: cost === null ? null : round(cost) };
  });
  models.sort((a, b) => (b.estimated_cost_usd ?? -1) - (a.estimated_cost_usd ?? -1));

  return {
    since: sinceIso,
    generated_at: now.toISOString(),
    sessions,
    subagents_running: total.slice.subagents_running,
    activity: { events: eventCount },
    tokens: total.slice.tokens,
    estimated_cost_usd: total.slice.estimated_cost_usd,
    unpriced_models: total.slice.unpriced_models,
    cache: total.slice.cache,
    by_model: models,
    transcripts: { read: sessions.total, unavailable: 0 },
    breakdown: breakdown
      ? {
          by_directory: [...groupBy(contributions, (c) => c.directory)].map(([dir, group]) => {
            const { slice, main } = aggregate(group);
            return { directory: dir, project: group[0].project, main_model: main, transcripts_unavailable: 0, ...slice };
          }),
          by_model: [...groupBy(contributions, (c) => c.model)].map(([model, group]) => {
            const { slice, byModel } = aggregate(group);
            const rate = rateTable(model);
            const t = byModel.get(model) ?? zero();
            return {
              model,
              rate,
              cost_breakdown: rate
                ? {
                    input: round((t.input * rate.input) / 1e6),
                    output: round((t.output * rate.output) / 1e6),
                    cache_read: round((t.cache_read * rate.cache_read) / 1e6),
                    cache_creation: round((t.cache_creation * rate.cache_write_5m) / 1e6),
                  }
                : null,
              ...slice,
            };
          }),
        }
      : null,
  };
}
