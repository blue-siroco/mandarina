// Invocaciones de Herramientas MCP del mock (`GET /api/v1/mcp-invocations`, AC-42).
// Sigue de forma simplificada `backend/src/domain/mcp-invocations.ts`.

import { isClosed } from './mock-closed.mjs';
const ORPHAN_AFTER_MS = 30 * 60 * 1000;
const LIMIT = 500;
const RESOURCE_TOOLS = new Set(['ListMcpResourcesTool', 'ReadMcpResourceTool']);

const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const firstLine = (v) => text(v)?.split('\n')[0].trim() ?? null;

function serverOf(toolName) {
  if (!toolName?.startsWith('mcp__')) return null;
  const rest = toolName.slice(5);
  const cut = rest.lastIndexOf('__');
  return cut > 0 && cut + 2 < rest.length ? { server: rest.slice(0, cut), tool: rest.slice(cut + 2) } : null;
}

function summarize(input) {
  const value = input && typeof input === 'object' ? Object.values(input).find((v) => typeof v === 'string' && v.trim() !== '') : null;
  if (!value) return null;
  const line = value.split('\n')[0].trim();
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

function sessionInvocations(events, now) {
  const closed = isClosed(events);
  const orphaned = now - Math.max(...events.map((e) => Date.parse(e.received_at))) > ORPHAN_AFTER_MS;
  const posts = new Map(events.filter((e) => e.event_type === 'tool.post').map((e) => [e.payload?.tool_use_id, e]));
  const stops = new Set(events.filter((e) => e.event_type === 'subagent.stopped').map((e) => e.subagent_id));
  const turnEnds = [];
  let turn = 0;
  const found = [];
  for (const e of events) {
    if (e.event_type === 'prompt.submitted' && !e.subagent_id) turn += 1;
    if (e.event_type === 'turn.ended' && !e.subagent_id && turn > 0) turnEnds[turn - 1] = true;
    if (e.event_type !== 'tool.pre' && e.event_type !== 'tool.blocked') continue;
    const mcp = e.payload?.mcp_server;
    const parsed = RESOURCE_TOOLS.has(e.tool_name)
      ? (text(e.payload?.tool_input?.server) ? { server: e.payload.tool_input.server, tool: e.tool_name } : null)
      : serverOf(e.tool_name);
    if (parsed) found.push({ e, server: text(mcp?.name) ?? parsed.server, scope: text(mcp?.source), tool: parsed.tool, turn });
  }
  return found
    .map(({ e, server, scope, tool, turn: t }) => {
      const post = posts.get(e.payload?.tool_use_id);
      const response = post?.payload?.tool_response;
      const over = closed || orphaned || (e.subagent_id ? stops.has(e.subagent_id) : t > 0 && turnEnds[t - 1] === true);
      let status;
      if (e.event_type === 'tool.blocked') status = 'blocked';
      else if (post?.payload?.is_interrupt) status = 'interrupted';
      else if (text(post?.payload?.error)) status = 'error';
      else if (post) status = 'ok';
      else status = over ? 'no_response' : 'running';
      const serialized = response === undefined || response === null ? null : typeof response === 'string' ? response : JSON.stringify(response);
      return {
        id: e.id,
        event_id: e.id,
        project: e.project,
        directory: e.directory,
        session_id: e.session_id,
        subagent_id: e.subagent_id,
        server,
        scope,
        tool,
        tool_name: e.tool_name,
        summary: summarize(e.payload?.tool_input),
        status,
        started_at: e.occurred_at,
        ended_at: post?.occurred_at ?? null,
        duration_ms: typeof post?.payload?.duration_ms === 'number' ? post.payload.duration_ms : post ? Math.max(0, Date.parse(post.occurred_at) - Date.parse(e.occurred_at)) : null,
        response_bytes: serialized === null ? null : Buffer.byteLength(serialized),
        has_image: Array.isArray(response) && response.some((b) => b?.type === 'image'),
        error: firstLine(post?.payload?.error),
      };
    })
    .reverse();
}

function unusedDeferred(events) {
  const used = new Set(events.filter((e) => e.event_type === 'tool.pre').map((e) => e.tool_name));
  const loaded = new Map();
  for (const e of events) {
    if (e.event_type !== 'tool.post' || e.tool_name !== 'ToolSearch') continue;
    for (const name of e.payload?.tool_response?.matches ?? []) {
      const parsed = serverOf(name);
      if (parsed && !used.has(name) && !loaded.has(name)) loaded.set(name, { session_id: e.session_id, tool_name: name, ...parsed, loaded_at: e.occurred_at });
    }
  }
  return [...loaded.values()];
}

const percentile = (sorted, p) => (sorted.length ? sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] : null);

function usageOf(items) {
  const count = (s) => items.filter((i) => i.status === s).length;
  const ok = count('ok');
  const errors = count('error');
  const latencies = items.map((i) => i.duration_ms).filter((d) => d !== null).sort((a, b) => a - b);
  const sizes = items.map((i) => i.response_bytes).filter((b) => b !== null);
  return {
    calls: items.length,
    ok,
    errors,
    interrupted: count('interrupted'),
    blocked: count('blocked'),
    running: count('running'),
    no_response: count('no_response'),
    failure_rate: ok + errors === 0 ? null : errors / (ok + errors),
    latency_p50_ms: percentile(latencies, 0.5),
    latency_p95_ms: percentile(latencies, 0.95),
    response_avg_bytes: sizes.length ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : null,
    response_max_bytes: sizes.length ? Math.max(...sizes) : null,
    has_image: items.some((i) => i.has_image),
    last_at: items.reduce((last, i) => (i.started_at > last ? i.started_at : last), items[0].started_at),
    sessions: new Set(items.map((i) => i.session_id)).size,
  };
}

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const group = groups.get(keyOf(item));
    if (group) group.push(item);
    else groups.set(keyOf(item), [item]);
  }
  return groups;
}

const byCalls = (a, b) => b.calls - a.calls || b.last_at.localeCompare(a.last_at);

export function listMcpInvocations(events, { since, project, server, sessionId }, now = Date.now()) {
  const sinceIso = since.toISOString();
  const receivedAt = new Map(events.map((e) => [e.id, e.received_at]));
  const all = [];
  const unused = [];
  for (const own of groupBy(events, (e) => e.session_id).values()) {
    all.push(...sessionInvocations(own, now).filter((i) => receivedAt.get(i.id) >= sinceIso));
    const project_ = own.at(-1).project;
    unused.push(...unusedDeferred(own).filter((u) => u.loaded_at >= sinceIso).map((u) => ({ ...u, project: project_ })));
  }
  all.sort((a, b) => b.started_at.localeCompare(a.started_at));
  const matches = (i) => (!project || i.project === project) && (!server || i.server === server) && (!sessionId || i.session_id === sessionId);
  const filtered = all.filter(matches);
  return {
    items: filtered.slice(0, LIMIT),
    servers: [...groupBy(filtered, (i) => i.server)]
      .map(([name, group]) => ({
        server: name,
        scopes: [...new Set(group.map((i) => i.scope).filter(Boolean))].sort(),
        projects: [...new Set(group.map((i) => i.project))].sort(),
        ...usageOf(group),
        tools: [...groupBy(group, (i) => i.tool_name)].map(([toolName, calls]) => ({ tool: calls[0].tool, tool_name: toolName, ...usageOf(calls) })).sort(byCalls),
      }))
      .sort(byCalls),
    unused_deferred: unused.filter(matches).map(({ project: _p, ...u }) => u),
    facets: { projects: [...new Set(all.map((i) => i.project))].sort(), servers: [...new Set(all.map((i) => i.server))].sort() },
  };
}
