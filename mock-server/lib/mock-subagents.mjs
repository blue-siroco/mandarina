// Ciclo de vida de los Subagentes en el mock (AC-33 a AC-35). Sigue de forma
// simplificada `backend/src/domain/subagent-lifecycle.ts` sobre los Eventos en memoria.


import { isClosed } from './mock-closed.mjs';
import { cacheView } from './mock-cache.mjs';
const LAUNCH_TOOLS = new Set(['Agent', 'Task']);
const ORPHAN_AFTER_MS = 30 * 60 * 1000;
const LIMIT = 500;

const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);
const normalize = (id) => (id.startsWith('agent-') ? id.slice('agent-'.length) : id);
const isLaunch = (e) => e.event_type === 'tool.pre' && LAUNCH_TOOLS.has(e.tool_name);
const isLaunchPost = (e) => e.event_type === 'tool.post' && LAUNCH_TOOLS.has(e.tool_name);

/** Subagentes de una Sesión (`events` en orden de llegada), por inicio. */
export function subagentLives(events) {
  const launches = events.filter(isLaunch);
  const posts = new Map(events.filter(isLaunchPost).map((e) => [e.payload?.tool_use_id, e]));
  const drafts = new Map();
  events.forEach((e, index) => {
    if (!e.subagent_id) return;
    const draft = drafts.get(e.subagent_id) ?? { id: e.subagent_id, own: [], index };
    draft.own.push(e);
    if (e.event_type === 'subagent.started') draft.start ??= e;
    if (e.event_type === 'subagent.stopped') draft.stop ??= e;
    drafts.set(e.subagent_id, draft);
  });
  for (const d of drafts.values()) d.type = text(d.start?.payload?.agent_type) ?? text(d.stop?.payload?.agent_type);

  const exact = new Map();
  for (const [toolUseId, post] of posts) if (text(post.payload?.tool_response?.agentId)) exact.set(toolUseId, normalize(post.payload.tool_response.agentId));
  const linked = new Set();
  for (const d of drafts.values()) {
    const toolUseId = [...exact].find(([, agentId]) => agentId === normalize(d.id))?.[0];
    const launch = launches.find((l) => l.payload?.tool_use_id === toolUseId);
    if (launch && !linked.has(launch.id)) (d.launch = launch), linked.add(launch.id);
  }
  for (const d of [...drafts.values()].sort((a, b) => a.index - b.index)) {
    if (d.launch || !d.type) continue;
    const launch = launches.find(
      (l) => !linked.has(l.id) && !exact.has(l.payload?.tool_use_id) && l.payload?.tool_input?.subagent_type === d.type && events.indexOf(l) < d.index,
    );
    if (launch) (d.launch = launch), linked.add(launch.id);
  }

  const endOf = (launch) => {
    const post = launch && posts.get(launch.payload?.tool_use_id);
    return post && post.payload?.tool_response?.status !== 'async_launched' ? post.occurred_at : null;
  };
  const fromLaunch = (launch) => ({
    tool_use_id: text(launch?.payload?.tool_use_id),
    launch_type: text(launch?.payload?.tool_input?.subagent_type),
    description: text(launch?.payload?.tool_input?.description),
    prompt: text(launch?.payload?.tool_input?.prompt),
  });

  const lives = [...drafts.values()].map((d) => {
    const l = fromLaunch(d.launch);
    const first = d.own[0];
    return {
      key: d.id,
      subagent_id: d.id,
      tool_use_id: l.tool_use_id,
      agent_type: d.type ?? l.launch_type,
      description: l.description,
      prompt: l.prompt,
      launch: d.launch ?? null,
      start: d.start ?? null,
      stop: d.stop ?? null,
      own: d.own,
      started_at: d.launch && d.launch.occurred_at < first.occurred_at ? d.launch.occurred_at : first.occurred_at,
      stopped_at: d.stop?.occurred_at ?? endOf(d.launch),
      internal: !d.launch && !d.type && d.own.every((e) => e.event_type === 'subagent.stopped'),
      order: d.index,
    };
  });
  for (const launch of launches) {
    if (linked.has(launch.id)) continue;
    const l = fromLaunch(launch);
    lives.push({
      key: `launch:${l.tool_use_id ?? launch.id}`,
      subagent_id: null,
      tool_use_id: l.tool_use_id,
      agent_type: l.launch_type,
      description: l.description,
      prompt: l.prompt,
      launch,
      start: null,
      stop: null,
      own: [],
      started_at: launch.occurred_at,
      stopped_at: endOf(launch),
      internal: false,
      order: events.indexOf(launch),
    });
  }
  return lives.sort((a, b) => a.started_at.localeCompare(b.started_at) || a.order - b.order);
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

/** Añade `subagent` a cada Evento, como `GET /api/v1/events` y el WebSocket (AC-34). */
/** `warningsOf` da los Avisos de inyección de un Evento (AC-64); sin él, ninguno. */
export function describeEvents(items, allEvents, warningsOf = () => []) {
  const sessions = bySession(allEvents);
  const cache = new Map();
  const livesOf = (sessionId) => {
    if (!cache.has(sessionId)) cache.set(sessionId, subagentLives(sessions.get(sessionId) ?? []));
    return cache.get(sessionId);
  };
  return items.map((event) => {
    const warnings = warningsOf(event);
    if (event.event_type !== 'subagent.started' && event.event_type !== 'subagent.stopped') return { ...event, subagent: null, warnings };
    const lives = livesOf(event.session_id);
    const life = lives.find((l) => l.start?.id === event.id || l.stop?.id === event.id) ?? lives.find((l) => l.subagent_id === event.subagent_id);
    if (!life) return { ...event, subagent: { type: null, description: null, duration_ms: null, internal: false }, warnings };
    const knownStart = life.launch || life.start || life.own.some((e) => e.event_type === 'tool.pre');
    return {
      ...event,
      subagent: {
        type: life.agent_type,
        description: life.description,
        duration_ms: event.event_type === 'subagent.stopped' && knownStart ? Math.max(0, Date.parse(event.occurred_at) - Date.parse(life.started_at)) : null,
        internal: life.internal,
      },
      warnings,
    };
  });
}

/** Servidor de `mcp__<servidor>__<herramienta>`, como `serverOf` del backend. */
const mcpServerOf = (name) => {
  if (!name?.startsWith('mcp__')) return null;
  const rest = name.slice(5);
  const cut = rest.lastIndexOf('__');
  return cut > 0 && cut + 2 < rest.length ? rest.slice(0, cut) : null;
};
const percentile = (sorted, p) => (sorted.length ? sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] : null);
const round = (usd) => Math.round(usd * 1e6) / 1e6;

/** Lo que hizo un Subagente según sus Eventos (AC-45). */
function ownActivity(own) {
  const tools = new Map();
  const mcp = new Map();
  const skills = [];
  const tally = (name) => tools.get(name) ?? tools.set(name, { name, calls: 0, errors: 0, blocks: 0 }).get(name);
  const server = (name) => {
    const key = mcpServerOf(name);
    return key === null ? undefined : (mcp.get(key) ?? mcp.set(key, { server: key, calls: 0, errors: 0 }).get(key));
  };
  for (const e of own) {
    if (!e.tool_name) continue;
    if (e.event_type === 'tool.pre') {
      tally(e.tool_name).calls += 1;
      const srv = server(e.tool_name);
      if (srv) srv.calls += 1;
      if (e.tool_name === 'Skill' && text(e.payload?.tool_input?.skill)) skills.push(e.payload.tool_input.skill);
    } else if (e.event_type === 'tool.post' && text(e.payload?.error) && !e.payload?.is_interrupt) {
      tally(e.tool_name).errors += 1;
      const srv = server(e.tool_name);
      if (srv) srv.errors += 1;
    } else if (e.event_type === 'tool.blocked') tally(e.tool_name).blocks += 1;
  }
  const list = [...tools.values()];
  return {
    tool_count: list.reduce((n, t) => n + t.calls, 0),
    tool_errors: list.reduce((n, t) => n + t.errors, 0),
    blocks: list.reduce((n, t) => n + t.blocks, 0),
    tools: list,
    skills,
    mcp: [...mcp.values()],
  };
}

/** Tasa de acierto y ahorro neto de la caché de un Lanzamiento, con Haiku como en el resto del mock (AC-73). */
function cacheOfTokens(tokens) {
  if (!tokens) return { cache_hit_rate: null, cache_savings_net_usd: null };
  const view = cacheView(new Map([['claude-haiku-4-5', tokens]]));
  return { cache_hit_rate: view.hit_rate, cache_savings_net_usd: view.savings_net_usd };
}

/** Lanzamientos del periodo con lo que hizo cada Subagente (AC-35, AC-45). */
function collectLaunches(events, since, now, syntheticTokens) {
  const sinceIso = since.toISOString();
  const all = [];
  for (const own of bySession(events).values()) {
    if (!own.some((e) => e.received_at >= sinceIso)) continue;
    const last = own.at(-1);
    const ended = isClosed(own);
    const live = !ended && now - Math.max(...own.map((e) => Date.parse(e.received_at))) <= ORPHAN_AFTER_MS;
    for (const life of subagentLives(own)) {
      if (!(life.started_at >= sinceIso || (live && life.stopped_at === null))) continue;
      const status = life.stopped_at !== null ? 'finished' : live ? 'running' : 'no_response';
      const end = life.stopped_at ?? (live ? new Date(now).toISOString() : last.occurred_at);
      const tokens = life.own.length > 0 ? syntheticTokens(life.own) : null;
      all.push({
        type: life.agent_type,
        launcher: null,
        session_id: last.session_id,
        project: last.project,
        directory: last.directory,
        internal: life.internal,
        subagent_id: life.subagent_id,
        tool_use_id: life.tool_use_id,
        description: life.description,
        status,
        background: life.launch?.payload?.tool_input?.run_in_background === true,
        started_at: life.started_at,
        stopped_at: life.stopped_at,
        duration_ms: Math.max(0, Date.parse(end) - Date.parse(life.started_at)),
        ...ownActivity(life.own),
        model: tokens ? 'claude-haiku-4-5' : null,
        tokens,
        estimated_cost_usd: tokens ? Math.round(tokens.output * 4) / 1e6 : null,
        ...cacheOfTokens(tokens),
        result: status === 'finished' && !life.internal ? 'Hecho.' : null,
        tests: { passed: 0, failed: 0 },
      });
    }
  }
  return all.sort((a, b) => b.started_at.localeCompare(a.started_at));
}

/** Imitación de `GET /api/v1/subagents` (AC-35). `syntheticTokens` viene de mock-sessions. */
export function listSubagents(events, { since, project, type, includeInternal = false }, { now = Date.now(), syntheticTokens }) {
  const visible = collectLaunches(events, since, now, syntheticTokens)
    .filter((l) => includeInternal || !l.internal)
    .map((l) => ({
      session_id: l.session_id,
      project: l.project,
      directory: l.directory,
      subagent_id: l.subagent_id,
      tool_use_id: l.tool_use_id,
      agent_type: l.type,
      description: l.description,
      internal: l.internal,
      status: l.status,
      started_at: l.started_at,
      stopped_at: l.stopped_at,
      duration_ms: l.duration_ms,
      tool_count: l.tool_count,
      model: l.model,
      tokens: l.tokens,
      estimated_cost_usd: l.estimated_cost_usd,
    }));
  const filtered = visible.filter((s) => (!project || s.project === project) && (!type || s.agent_type === type));
  return {
    items: filtered.slice(0, LIMIT),
    facets: {
      projects: [...new Set(visible.map((s) => s.project))].sort(),
      types: [...new Set(visible.map((s) => s.agent_type).filter(Boolean))].sort(),
    },
  };
}

function summaryOf(type, launches) {
  const durations = launches.filter((l) => l.status === 'finished').map((l) => l.duration_ms).sort((a, b) => a - b);
  const costs = launches.map((l) => l.estimated_cost_usd).filter((c) => c !== null);
  const tokens = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
  for (const l of launches) if (l.tokens) for (const k of Object.keys(tokens)) tokens[k] += l.tokens[k];
  const total = launches.length;
  return {
    type,
    launches: total,
    running: launches.filter((l) => l.status === 'running').length,
    no_response: launches.filter((l) => l.status === 'no_response').length,
    foreground: launches.filter((l) => !l.background).length,
    background: launches.filter((l) => l.background).length,
    duration_p50_ms: percentile(durations, 0.5),
    duration_p95_ms: percentile(durations, 0.95),
    tokens,
    estimated_cost_usd: round(costs.reduce((a, b) => a + b, 0)),
    cost_per_launch_usd: costs.length ? round(costs.reduce((a, b) => a + b, 0) / costs.length) : null,
    tool_errors_per_launch: total ? launches.reduce((n, l) => n + l.tool_errors, 0) / total : 0,
    blocks_per_launch: total ? launches.reduce((n, l) => n + l.blocks, 0) / total : 0,
    cache_hit_rate: (() => {
      const side = tokens.input + tokens.cache_read + tokens.cache_creation;
      return side === 0 ? null : tokens.cache_read / side;
    })(),
    cache_savings_net_usd: round(launches.reduce((sum, l) => sum + (l.cache_savings_net_usd ?? 0), 0)),
    rated_up: launches.filter((l) => l.rating === 1).length,
    rated_down: launches.filter((l) => l.rating === -1).length,
    sessions: new Set(launches.map((l) => l.session_id)).size,
    projects: [...new Set(launches.map((l) => l.project))].sort(),
    last_at: launches.reduce((last, l) => (l.started_at > last ? l.started_at : last), launches[0]?.started_at ?? ''),
  };
}

function agentLaunches(events, { since, project }, now, syntheticTokens, subagentScores = new Map()) {
  const all = collectLaunches(events, since, now, syntheticTokens)
    .filter((l) => !l.internal)
    .map((l) => ({ ...l, rating: subagentScores.get(l.subagent_id ?? '') ?? null }));
  return { all, filtered: all.filter((l) => !project || l.project === project) };
}

/** Imitación de `GET /api/v1/agents` (AC-46). */
export function listAgents(events, filter, { now = Date.now(), syntheticTokens, subagentScores }) {
  const { all, filtered } = agentLaunches(events, filter, now, syntheticTokens, subagentScores);
  const byType = new Map();
  for (const l of filtered) byType.set(l.type, [...(byType.get(l.type) ?? []), l]);
  return {
    items: [...byType].map(([type, group]) => summaryOf(type, group)).sort((a, b) => b.launches - a.launches || b.last_at.localeCompare(a.last_at)),
    facets: { projects: [...new Set(all.map((l) => l.project))].sort() },
  };
}

/** Imitación de `GET /api/v1/agents/{type}` (AC-46); `sin-tipo` son los Lanzamientos sin Tipo. */
export function agentProfile(events, type, filter, { now = Date.now(), syntheticTokens, subagentScores }) {
  const wanted = type === 'sin-tipo' ? null : type;
  const launches = agentLaunches(events, filter, now, syntheticTokens, subagentScores).filtered.filter((l) => l.type === wanted);
  const count = (items, keyOf) => {
    const map = new Map();
    for (const item of items) map.set(keyOf(item), (map.get(keyOf(item)) ?? 0) + 1);
    return map;
  };
  const tools = new Map();
  const mcp = new Map();
  for (const l of launches) {
    for (const t of l.tools) {
      const acc = tools.get(t.name) ?? { name: t.name, calls: 0, errors: 0, blocks: 0 };
      acc.calls += t.calls;
      acc.errors += t.errors;
      acc.blocks += t.blocks;
      tools.set(t.name, acc);
    }
    for (const m of l.mcp) {
      const acc = mcp.get(m.server) ?? { server: m.server, calls: 0, errors: 0 };
      acc.calls += m.calls;
      acc.errors += m.errors;
      mcp.set(m.server, acc);
    }
  }
  const passed = launches.reduce((n, l) => n + l.tests.passed, 0);
  const failed = launches.reduce((n, l) => n + l.tests.failed, 0);
  return {
    summary: summaryOf(wanted, launches),
    launched_by: [...count(launches, (l) => l.launcher)].map(([launcher, n]) => ({ launcher, launches: n })),
    models: [...count(launches.filter((l) => l.model), (l) => l.model)].map(([model, n]) => ({ model, launches: n })),
    tools: [...tools.values()].sort((a, b) => b.calls - a.calls),
    skills: [...count(launches.flatMap((l) => l.skills), (s) => s)].map(([skill, n]) => ({ skill, invocations: n })).sort((a, b) => b.invocations - a.invocations),
    mcp_servers: [...mcp.values()].sort((a, b) => b.calls - a.calls),
    test_runs: { total: passed + failed, passed, failed },
    launches: launches.slice(0, LIMIT).map(({ type: _t, launcher: _l, tools: _tools, skills: _s, mcp: _m, tests: _tests, directory: _d, internal: _i, rating: _r, ...rest }) => rest),
  };
}
