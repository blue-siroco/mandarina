// Invocaciones de skill del mock (`GET /api/v1/skill-invocations`, AC-30). Sigue
// de forma simplificada las reglas de `backend/src/domain/skill-invocations.ts`.

import { isClosed } from './mock-closed.mjs';
const ORPHAN_AFTER_MS = 30 * 60 * 1000;
const LIMIT = 500;
const SLASH_COMMAND = /^\/([\w:-]+)(?=\s|$)(.*)/;

const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const firstLine = (v) => text(v)?.split('\n')[0].trim() || null;

function loaded(event, turn) {
  if (event.event_type === 'prompt.submitted' && event.subagent_id === null) {
    const match = typeof event.payload?.prompt === 'string' ? SLASH_COMMAND.exec(event.payload.prompt.trimStart()) : null;
    return match && { skill: match[1], args: firstLine(match[2]), invoker: 'user', turn };
  }
  if (event.event_type !== 'tool.pre' || event.tool_name !== 'Skill') return null;
  const skill = text(event.payload?.tool_input?.skill);
  return skill && { skill, args: firstLine(event.payload.tool_input.args), invoker: event.subagent_id === null ? 'agent' : 'subagent', turn };
}

function sessionInvocations(events, now) {
  const closed = isClosed(events);
  const orphaned = now - Math.max(...events.map((e) => Date.parse(e.received_at))) > ORPHAN_AFTER_MS;
  const turnEnds = [];
  const stops = new Map();
  const types = new Map();
  const posts = new Map();
  const found = [];
  let turn = 0;
  for (const e of events) {
    const main = e.subagent_id === null;
    if (main && e.event_type === 'prompt.submitted') {
      // Un prompt sin `turn.ended` previo cierra el Turno anterior, como en el backend.
      if (turn > 0 && turnEnds[turn - 1] === undefined) turnEnds[turn - 1] = e.occurred_at;
      turn += 1;
    } else if (main && e.event_type === 'turn.ended' && turn > 0 && turnEnds[turn - 1] === undefined) turnEnds[turn - 1] = e.occurred_at;
    if (!main && (e.event_type === 'subagent.started' || e.event_type === 'subagent.stopped')) {
      if (text(e.payload?.agent_type) && !types.has(e.subagent_id)) types.set(e.subagent_id, e.payload.agent_type);
      if (e.event_type === 'subagent.stopped' && !stops.has(e.subagent_id)) stops.set(e.subagent_id, e.occurred_at);
    }
    if (e.event_type === 'tool.post' && e.tool_name === 'Skill') posts.set(e.payload?.tool_use_id, e);
    const invocation = loaded(e, turn || null);
    if (invocation) found.push({ event: e, ...invocation });
  }
  return found.map(({ event, ...invocation }) => {
    const post = posts.get(event.payload?.tool_use_id);
    const failed = post && (text(post.payload.error) || post.payload.tool_response?.success === false);
    const endedAt = failed
      ? null
      : event.subagent_id !== null
        ? (stops.get(event.subagent_id) ?? null)
        : invocation.turn === null
          ? null
          : (turnEnds[invocation.turn - 1] ?? null);
    return {
      id: event.id,
      event_id: event.id,
      project: event.project,
      directory: event.directory,
      session_id: event.session_id,
      subagent_id: event.subagent_id,
      subagent_type: event.subagent_id === null ? null : (types.get(event.subagent_id) ?? null),
      ...invocation,
      status: failed ? 'failed' : endedAt !== null || closed || orphaned ? 'finished' : 'running',
      started_at: event.occurred_at,
      ended_at: endedAt,
      duration_ms: endedAt === null ? null : Math.max(0, Date.parse(endedAt) - Date.parse(event.occurred_at)),
      error: failed ? firstLine(post.payload.error) : null,
    };
  });
}

function usage(items) {
  const byKey = new Map();
  for (const item of items) {
    const key = `${item.project}\u0000${item.skill}`;
    const row = byKey.get(key) ?? { project: item.project, skill: item.skill, total: 0, by_invoker: { agent: 0, subagent: 0, user: 0 }, last_at: item.started_at };
    row.total += 1;
    row.by_invoker[item.invoker] += 1;
    if (item.started_at > row.last_at) row.last_at = item.started_at;
    byKey.set(key, row);
  }
  return [...byKey.values()].sort((a, b) => b.total - a.total || b.last_at.localeCompare(a.last_at));
}

/** `events` va del más antiguo al más reciente. */
export function listSkillInvocations(events, { since, project, sessionId }, now = Date.now()) {
  const sinceIso = since.toISOString();
  const receivedAt = new Map(events.map((e) => [e.id, e.received_at]));
  const sessions = new Map();
  for (const e of events) {
    const list = sessions.get(e.session_id);
    if (list) list.push(e);
    else sessions.set(e.session_id, [e]);
  }
  const all = [...sessions.values()]
    .flatMap((list) => sessionInvocations(list, now))
    .filter((i) => receivedAt.get(i.event_id) >= sinceIso)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  const filtered = all.filter((i) => (!project || i.project === project) && (!sessionId || i.session_id === sessionId));
  return {
    items: filtered.slice(0, LIMIT),
    stats: usage(filtered),
    facets: { projects: [...new Set(all.map((i) => i.project))].sort() },
  };
}
