// Imitación de `GET /api/v1/sessions` y `GET /api/v1/sessions/{id}` (AC-15, AC-18)
// sobre los Eventos en memoria. Sigue las reglas de `backend/src/domain/session-summary.ts`
// de forma simplificada; el mock no tiene Transcripts, así que modelo, tokens y
// contexto son sintéticos (el modelo sale del `SessionStart`).

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const ORPHAN_AFTER_MS = 30 * 60 * 1000;
const BUCKETS = 12;
const BUCKET_MS = 5 * 60 * 1000;
const IDLE_AFTER = new Set(['session.started', 'turn.ended']);
// El mock no tiene Transcripts: la Tarea y la respuesta de cada Subagente se
// sintetizan a partir de su tipo, de forma determinista (AC-23).
const TASKS = {
  Explore: {
    description: 'Explorar el código relacionado',
    prompt: 'Localiza los ficheros que implementan esta funcionalidad y resume cómo encajan. No modifiques nada.',
    result: 'He localizado 4 ficheros relevantes; el punto de entrada está en src/app.ts y la lógica en src/domain/.',
  },
  Plan: {
    description: 'Planificar la implementación',
    prompt: 'Propón un plan paso a paso para implementar el cambio pedido, con los ficheros a tocar y los riesgos.',
    result: 'Plan en 3 pasos: 1) contrato, 2) dominio con tests, 3) UI. Riesgo principal: la migración de datos.',
  },
  'general-purpose': {
    description: 'Investigar el fallo del build',
    prompt: 'Averigua por qué falla el build en CI y propone la corrección mínima.',
    result: 'El build falla por un import circular entre dos módulos; basta con mover el tipo compartido a models/.',
  },
};
const UNKNOWN_TASK = { description: null, prompt: null, result: null };

import { isClosed } from './mock-closed.mjs';
import { cacheView, isRewrite, rewriteCause, writeCost } from './mock-cache.mjs';
import { subagentLives } from './mock-subagents.mjs';
import { currentWait, lastProgress, toWaitingView } from './mock-waiting.mjs';

const ms = (iso) => Date.parse(iso);
const text = (v) => (typeof v === 'string' && v !== '' ? v : null);

function summarizeInput(toolName, payload) {
  const input = payload?.tool_input;
  if (!input || typeof input !== 'object') return null;
  const value = Object.values(input).find((v) => typeof v === 'string' && v.trim() !== '');
  return value ? value.split('\n')[0].slice(0, 80) : null;
}

function buildTurns(events) {
  const turns = [];
  let open;
  const close = (endedAt, lastAt) => {
    if (!open) return;
    turns.push({
      id: open.event.id,
      index: turns.length + 1,
      started_at: open.event.occurred_at,
      ended_at: endedAt,
      duration_ms: Math.max(0, ms(endedAt ?? lastAt) - ms(open.event.occurred_at)),
      prompt: text(open.event.payload?.prompt),
      tool_count: open.tools,
    });
    open = undefined;
  };
  for (const e of events) {
    const main = e.subagent_id === null;
    if (main && e.event_type === 'prompt.submitted') {
      close(e.occurred_at, e.occurred_at);
      open = { event: e, tools: 0 };
    } else if (main && e.event_type === 'turn.ended') close(e.occurred_at, e.occurred_at);
    else if (open && (e.event_type === 'tool.pre' || e.event_type === 'tool.blocked')) open.tools += 1;
  }
  if (open) close(null, events.at(-1).occurred_at);
  return turns;
}

function summarize(events, now) {
  const first = events[0];
  const last = events.at(-1);
  const ended = isClosed(events);
  const lastMs = Math.max(...events.map((e) => ms(e.received_at)));
  // Un aviso (permiso, notificación) no abre ni cierra el Turno (ADR-0011).
  const rawActivity = IDLE_AFTER.has(lastProgress(events)?.event_type) ? 'paused' : 'working';
  const wait = currentWait(events);
  // Esperar no mantiene la Sesión Activa: tras 5 min pasa a Inactiva como una pausada.
  const stateActivity = wait ? 'paused' : rawActivity;
  const quiet = now - lastMs;
  let state = 'idle';
  if (ended) state = 'closed';
  else if (quiet > ORPHAN_AFTER_MS) state = 'orphaned';
  else if (quiet <= ACTIVE_WINDOW_MS || stateActivity === 'working') state = 'active';
  const live = state === 'active' || state === 'idle';

  const pending = new Map();
  for (const e of events) {
    const lane = e.subagent_id ?? 'main';
    if (e.event_type === 'tool.pre') pending.set(lane, e);
    else if (['tool.post', 'tool.blocked', 'subagent.stopped'].includes(e.event_type)) pending.delete(lane);
    else if (e.event_type === 'turn.ended' || e.event_type === 'session.ended') pending.clear();
  }
  const open = [...pending.values()].sort((a, b) => ms(b.received_at) - ms(a.received_at))[0];
  const pendingByLane = pending;

  // Sin los internos; los lanzamientos pendientes cuentan como en marcha (AC-34).
  const lives = subagentLives(events).filter((l) => !l.internal);
  // Con el Turno terminado no queda nada en marcha (AC-125): igual que el backend.
  const turnOpen = wait !== null || rawActivity === 'working';
  const running = live && turnOpen ? lives.filter((l) => l.stopped_at === null) : [];
  const sparkline = new Array(BUCKETS).fill(0);
  const from = now - BUCKETS * BUCKET_MS;
  for (const e of events) {
    const offset = ms(e.received_at) - from;
    if (offset >= 0 && offset <= BUCKETS * BUCKET_MS) sparkline[Math.min(BUCKETS - 1, Math.floor(offset / BUCKET_MS))] += 1;
  }
  const turns = buildTurns(events);
  const count = (type) => events.filter((e) => e.event_type === type).length;
  const model = text(events.find((e) => e.event_type === 'session.started')?.payload?.model) ?? 'claude-opus-5-5';

  return {
    session_id: first.session_id,
    project: last.project,
    directory: last.directory,
    harness: last.harness,
    state,
    activity: live ? (wait ? 'waiting' : rawActivity) : null,
    waiting: live && wait ? toWaitingView(wait, lives) : null,
    current_tool:
      live && (wait || rawActivity === 'working') && open?.tool_name
        ? { name: open.tool_name, summary: summarizeInput(open.tool_name, open.payload) }
        : null,
    model,
    started_at: first.occurred_at,
    last_event_at: last.occurred_at,
    last_activity_at: new Date(lastMs).toISOString(),
    event_count: events.length,
    tool_count: count('tool.pre'),
    prompt_count: count('prompt.submitted'),
    turn_count: turns.length,
    subagent_count: lives.length,
    running_subagents: running.length,
    live_subagents: running.map((life) => {
      const tool = life.subagent_id ? pendingByLane.get(life.subagent_id) : undefined;
      return {
        subagent_id: life.subagent_id,
        agent_type: life.agent_type,
        description: life.description ?? (TASKS[life.agent_type] ?? UNKNOWN_TASK).description,
        current_tool: tool?.tool_name ? { name: tool.tool_name, summary: summarizeInput(tool.tool_name, tool.payload) } : null,
      };
    }),
    block_count: count('tool.blocked'),
    evaluation_score: null,
    injection_alerts: 0,
    budget_stopped: false,
    active_duration_ms: turns.reduce((sum, t) => sum + t.duration_ms, 0),
    clock_duration_ms: Math.max(0, ms(last.occurred_at) - ms(first.occurred_at)),
    sparkline,
    _turns: turns,
  };
}

function bySession(events) {
  const groups = new Map();
  for (const e of events) {
    const list = groups.get(e.session_id);
    if (list) list.push(e);
    else groups.set(e.session_id, [e]);
  }
  return groups;
}

const publicSummary = ({ _turns, ...summary }) => summary;

/**
 * @param {Array<object>} events Más antiguo primero.
 * @param {{ since?: Date, states?: string[], directory?: string, project?: string }} filter
 */
/** `sessionScores`: Puntuación de la Evaluación de cada Sesión evaluada (AC-59). */
export function listSessions(events, filter, now = Date.now(), sessionScores = new Map(), alerts = new Map()) {
  const since = filter.since?.toISOString();
  const all = [...bySession(events).values()]
    .filter((own) => since === undefined || own.some((e) => e.received_at >= since))
    .map((own) => ({
      ...summarize(own, now),
      evaluation_score: sessionScores.get(own[0].session_id) ?? null,
      injection_alerts: alerts.get(own[0].session_id) ?? 0,
      budget_stopped: own.findLast((e) => e.event_type === 'tool.blocked')?.block?.rule === 'budget',
    }));
  const facets = {
    projects: [...new Set(all.map((s) => s.project))].sort(),
    directories: [...new Set(all.map((s) => s.directory))].sort(),
  };
  const items = all
    .filter((s) => !filter.states?.length || filter.states.includes(s.state))
    .filter((s) => !filter.directory || s.directory === filter.directory)
    .filter((s) => !filter.project || s.project === filter.project)
    .sort((a, b) => ms(b.started_at) - ms(a.started_at) || a.session_id.localeCompare(b.session_id))
    .map(publicSummary);
  return { items, facets };
}

// Tokens sintéticos por Evento, deterministas, como en `mock-metrics.mjs`.
export function syntheticTokens(events) {
  const tokens = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
  for (const e of events) {
    if (e.event_type !== 'tool.post' && e.event_type !== 'turn.ended') continue;
    const n = [...e.id].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 997, 7);
    tokens.input += 2 + (n % 40);
    tokens.output += 80 + n * 3;
    tokens.cache_read += 8000 + n * 60;
    tokens.cache_creation += 300 + n * 4;
  }
  return tokens;
}

const SUBAGENT_MODEL = 'claude-haiku-4-5';

/** Eficiencia de la caché y Reescrituras de una Sesión, con los mismos tokens sintéticos (AC-72). */
function cacheOf(own, sessionModel) {
  const byModel = new Map();
  const rewrites = [];
  let cost = 0;
  for (const e of own) {
    if (e.event_type !== 'tool.post' && e.event_type !== 'turn.ended') continue;
    const model = e.subagent_id ? SUBAGENT_MODEL : sessionModel;
    const tokens = syntheticTokens([e]);
    const total = byModel.get(model) ?? { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
    for (const key of Object.keys(total)) total[key] += tokens[key];
    byModel.set(model, total);
    if (!isRewrite(e)) continue;
    const usd = writeCost(model, tokens);
    cost += usd ?? 0;
    rewrites.push({
      message_id: e.id,
      subagent_id: e.subagent_id ?? null,
      occurred_at: e.occurred_at,
      model,
      cause: rewriteCause(e),
      written_tokens: tokens.cache_creation,
      cost_usd: usd,
      gap_ms: 6 * 60_000,
    });
  }
  return { cache: cacheView(byModel, { count: rewrites.length, cost_usd: cost }), cache_rewrites: rewrites };
}

/** Herramientas de un carril en orden, emparejando `tool.pre` y `tool.post` por `tool_use_id`. */
function toolCalls(events) {
  const calls = [];
  const open = new Map();
  for (const e of events) {
    const id = e.payload?.tool_use_id;
    if (e.event_type === 'tool.pre' || e.event_type === 'tool.blocked') {
      const call = {
        name: e.tool_name ?? 'desconocida',
        summary: summarizeInput(e.tool_name, e.payload),
        started_at: e.occurred_at,
        status: e.event_type === 'tool.blocked' ? 'blocked' : 'running',
      };
      calls.push(call);
      if (call.status === 'running' && id) open.set(id, call);
    } else if (e.event_type === 'tool.post' && open.has(id)) {
      // `PostToolUseFailure` trae `error` en lugar de `tool_response` (AC-25).
      open.get(id).status = e.payload.error ? 'error' : 'ok';
      open.delete(id);
    }
  }
  return calls;
}

export function sessionDetail(events, sessionId, now = Date.now(), sessionScores = new Map(), alerts = new Map()) {
  const own = events.filter((e) => e.session_id === sessionId);
  if (own.length === 0) return null;
  const summary = {
    ...summarize(own, now),
    evaluation_score: sessionScores.get(sessionId) ?? null,
    injection_alerts: alerts.get(sessionId) ?? 0,
    budget_stopped: own.findLast((e) => e.event_type === 'tool.blocked')?.block?.rule === 'budget',
  };
  const tokens = syntheticTokens(own);
  const requests = own.filter((e) => e.event_type === 'tool.post' || e.event_type === 'turn.ended').length;
  const tools = new Map();
  for (const e of own) if (e.event_type === 'tool.pre' && e.tool_name) tools.set(e.tool_name, (tools.get(e.tool_name) ?? 0) + 1);

  return {
    ...publicSummary(summary),
    transcript_available: true,
    ...cacheOf(own, summary.model),
    usage: requests > 0 ? { tokens, estimated_cost_usd: Math.round(tokens.output * 20) / 1e6, requests, models: [summary.model] } : null,
    context: requests > 0 ? { model: summary.model, used: Math.min(990_000, 20_000 + requests * 3_500), limit: 1_000_000 } : null,
    tools: [...tools].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    turns: summary._turns,
    subagents: subagentLives(own).map((life) => {
      const task = TASKS[life.agent_type] ?? UNKNOWN_TASK;
      const end = life.stopped_at ?? life.own.at(-1)?.occurred_at ?? life.started_at;
      const hasTask = !life.internal;
      return {
        subagent_id: life.subagent_id,
        tool_use_id: life.tool_use_id,
        agent_type: life.agent_type,
        internal: life.internal,
        started_at: life.started_at,
        stopped_at: life.stopped_at,
        duration_ms: Math.max(0, ms(end) - ms(life.started_at)),
        tool_count: life.own.filter((e) => e.event_type === 'tool.pre').length,
        model: life.own.length > 0 ? 'claude-haiku-4-5' : null,
        tokens: life.own.length > 0 ? syntheticTokens(life.own) : null,
        task: hasTask ? { description: life.description ?? task.description, prompt: life.prompt ?? task.prompt } : null,
        tools: toolCalls(life.own),
        result: life.stop ? (life.internal ? text(life.stop.payload?.last_assistant_message) : task.result) : null,
      };
    }),
    blocks: own
      .filter((e) => e.event_type === 'tool.blocked' && e.block)
      .map((e) => ({
        event_id: e.id,
        occurred_at: e.occurred_at,
        subagent_id: e.subagent_id,
        tool_name: e.tool_name,
        summary: summarizeInput(e.tool_name, e.payload),
        rule: e.block.rule,
        reason: e.block.reason,
      })),
  };
}
