import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createMockApi } from '../lib/mock-api.mjs';

async function start(options) {
  const api = createMockApi({ intervalMs: 0, historySize: 5, ...options });
  const { port } = await api.listen(0, '127.0.0.1');
  return { api, base: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}/ws` };
}

test('health responde ok', async () => {
  const { api, base } = await start();
  assert.deepEqual(await (await fetch(`${base}/api/v1/health`)).json(), { status: 'ok' });
  await api.close();
});

test('GET /api/v1/events devuelve el historial precargado, más reciente primero, y pagina con before', async () => {
  const { api, base } = await start();
  const { items } = await (await fetch(`${base}/api/v1/events?limit=3`)).json();
  assert.equal(items.length, 3);
  assert.ok(items[0].received_at > items[1].received_at);

  const older = await (await fetch(`${base}/api/v1/events?limit=3&before=${items[2].id}`)).json();
  assert.equal(older.items.length, 2);
  assert.equal((await fetch(`${base}/api/v1/events?before=nope`)).status, 400);
  assert.equal((await fetch(`${base}/api/v1/events?limit=0`)).status, 400);
  await api.close();
});

test('POST /api/v1/events acepta un Evento válido y lo difunde por /ws', async () => {
  const { api, base, ws } = await start({ historySize: 0 });
  const client = new WebSocket(ws);
  await new Promise((r) => client.once('open', r));
  const message = new Promise((r) => client.once('message', (d) => r(JSON.parse(d.toString()))));

  const body = {
    schema_version: 1,
    harness: 'claude-code',
    project: 'demo',
    directory: '/d',
    session_id: 's',
    event_type: 'turn.ended',
    native_event_type: 'Stop',
    occurred_at: new Date().toISOString(),
    payload: {},
  };
  const response = await fetch(`${base}/api/v1/events`, { method: 'POST', body: JSON.stringify(body) });
  assert.equal(response.status, 202);

  const live = await message;
  assert.equal(live.type, 'event.ingested');
  assert.equal(live.event.id, (await response.json()).id);
  assert.equal(live.event.subagent_id, null);
  client.terminate();
  await api.close();
});

test('POST /api/v1/events rechaza Eventos inválidos con 400', async () => {
  const { api, base } = await start();
  for (const body of ['no json', JSON.stringify({ project: 'x' }), JSON.stringify({ event_type: 'x' })]) {
    const response = await fetch(`${base}/api/v1/events`, { method: 'POST', body });
    assert.equal(response.status, 400);
    assert.ok((await response.json()).message);
  }
  await api.close();
});

test('con intervalo genera Eventos en vivo por /ws', async () => {
  const { api, ws } = await start({ intervalMs: 20, historySize: 0 });
  const client = new WebSocket(ws);
  const message = await new Promise((r) => client.once('message', (d) => r(JSON.parse(d.toString()))));
  assert.equal(message.type, 'event.ingested');
  assert.equal(message.event.harness, 'claude-code');
  client.terminate();
  await api.close();
});

test('GET /api/v1/metrics resume los Eventos y exige since (AC-11, AC-12)', async () => {
  const { api, base } = await start({ historySize: 30 });
  const body = await (await fetch(`${base}/api/v1/metrics?since=${new Date(0).toISOString()}`)).json();
  assert.equal(body.activity.events, 30);
  assert.ok(body.sessions.total > 0);
  assert.equal(
    body.sessions.working + body.sessions.paused + body.sessions.orphaned + body.sessions.closed,
    body.sessions.total,
  );
  assert.ok(body.tokens.output > 0);
  assert.ok(body.estimated_cost_usd > 0);
  assert.equal((await fetch(`${base}/api/v1/metrics`)).status, 400);
  await api.close();
});

test('GET /api/v1/sessions y /sessions/:id resumen las Sesiones simuladas (AC-15, AC-18)', async () => {
  // Con 150 Eventos la simulación ya ha lanzado algún Subagente.
  const { api, base } = await start({ historySize: 150 });
  const { items, facets } = await (await fetch(`${base}/api/v1/sessions`)).json();
  assert.ok(items.length > 0);
  assert.ok(facets.projects.length > 0);
  assert.equal(items[0].sparkline.length, 12);
  assert.ok(['active', 'idle', 'orphaned', 'closed'].includes(items[0].state));

  const detail = await (await fetch(`${base}/api/v1/sessions/${items[0].session_id}`)).json();
  assert.equal(detail.session_id, items[0].session_id);
  assert.ok(Array.isArray(detail.turns));
  assert.ok(items.every((s) => Array.isArray(s.live_subagents)));
  // Orden estable: por inicio, la más nueva primero (AC-15).
  const starts = items.map((s) => Date.parse(s.started_at));
  assert.deepEqual(starts, [...starts].sort((a, b) => b - a));

  // Tarea y actividad de los Subagentes (AC-23).
  const withSubagent = items.find((s) => s.subagent_count > 0);
  assert.ok(withSubagent, 'la simulación debería tener algún Subagente');
  const { subagents } = await (await fetch(`${base}/api/v1/sessions/${withSubagent.session_id}`)).json();
  const delegated = subagents.find((s) => !s.internal);
  assert.ok(delegated.task.description && delegated.tool_use_id);
  assert.ok(Array.isArray(delegated.tools));
  assert.ok(delegated.stopped_at === null || delegated.result);
  assert.equal((await fetch(`${base}/api/v1/sessions/no-existe`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/sessions?state=zombie`)).status, 400);
  await api.close();
});

test('GET /api/v1/test-runs lee las Ejecuciones de tests simuladas (AC-27)', async () => {
  const { api, base } = await start({ historySize: 400 });
  const since = new Date(0).toISOString();
  const { items, facets } = await (await fetch(`${base}/api/v1/test-runs?since=${since}`)).json();
  assert.ok(items.some((r) => r.kind === 'unit') && items.some((r) => r.kind === 'e2e'));
  assert.ok(items.some((r) => r.status === 'failed' && r.failures.length > 0));
  const finished = items.map((r) => r.finished_at);
  assert.deepEqual(finished, [...finished].sort().reverse());
  for (const run of items) {
    assert.equal(run.counts.total, run.counts.passed + run.counts.failed + run.counts.skipped);
    assert.equal(run.status, run.counts.failed > 0 ? 'failed' : 'passed');
  }
  assert.ok(facets.projects.length > 0);

  const e2e = (await (await fetch(`${base}/api/v1/test-runs?since=${since}&kind=e2e`)).json()).items;
  assert.ok(e2e.length > 0 && e2e.every((r) => r.runner === 'playwright'));
  assert.equal((await fetch(`${base}/api/v1/test-runs`)).status, 400);
  assert.equal((await fetch(`${base}/api/v1/test-runs?since=${since}&kind=x`)).status, 400);
  await api.close();
});

test('GET /api/v1/events filtra por Sesión y Tipo de evento (AC-17)', async () => {
  const { api, base } = await start({ historySize: 60 });
  const all = (await (await fetch(`${base}/api/v1/events?limit=500`)).json()).items;
  const session = all[0].session_id;
  const own = (await (await fetch(`${base}/api/v1/events?session_id=${session}&limit=500`)).json()).items;
  assert.ok(own.length > 0 && own.every((e) => e.session_id === session));
  const pre = (await (await fetch(`${base}/api/v1/events?event_type=tool.pre&event_type=tool.blocked`)).json()).items;
  assert.ok(pre.every((e) => e.event_type === 'tool.pre' || e.event_type === 'tool.blocked'));
  await api.close();
});

test('GET /api/v1/skill-invocations lee las Invocaciones de skill simuladas (AC-30)', async () => {
  const { api, base } = await start({ historySize: 400 });
  const since = new Date(0).toISOString();
  const { items, stats, facets } = await (await fetch(`${base}/api/v1/skill-invocations?since=${since}`)).json();
  assert.ok(items.some((i) => i.invoker === 'user') && items.some((i) => i.invoker === 'agent'));
  const started = items.map((i) => i.started_at);
  assert.deepEqual(started, [...started].sort().reverse());
  for (const item of items) {
    assert.ok(['running', 'finished', 'failed'].includes(item.status));
    assert.equal(item.invoker === 'subagent', item.subagent_id !== null);
  }
  assert.equal(stats.reduce((n, s) => n + s.total, 0), items.length);
  assert.ok(facets.projects.length > 0);

  const session = items[0].session_id;
  const own = (await (await fetch(`${base}/api/v1/skill-invocations?since=${since}&session_id=${session}`)).json()).items;
  assert.ok(own.length > 0 && own.every((i) => i.session_id === session));
  assert.equal((await fetch(`${base}/api/v1/skill-invocations`)).status, 400);
  assert.equal((await fetch(`${base}/api/v1/skill-invocations?since=${since}&project=`)).status, 400);
  await api.close();
});

test('AC-34, AC-35: Eventos de Subagente descritos y GET /api/v1/subagents', async () => {
  const { api, base } = await start({ historySize: 600 });
  const since = new Date(0).toISOString();
  const { items: events } = await (await fetch(`${base}/api/v1/events?limit=500&event_type=subagent.started&event_type=subagent.stopped`)).json();
  assert.ok(events.length > 0 && events.every((e) => e.subagent && typeof e.subagent.internal === 'boolean'));
  assert.ok(events.some((e) => e.subagent.internal) && events.some((e) => e.subagent.type && e.subagent.description));
  const { items: others } = await (await fetch(`${base}/api/v1/events?limit=5&event_type=prompt.submitted`)).json();
  assert.ok(others.every((e) => e.subagent === null));

  const body = await (await fetch(`${base}/api/v1/subagents?since=${since}`)).json();
  const { items, facets } = body;
  assert.ok(items.length > 0 && items.every((s) => !s.internal && ['running', 'finished', 'no_response'].includes(s.status)));
  assert.equal(body.stats, undefined);
  assert.ok(facets.types.length > 0 && facets.projects.length > 0);
  const withInternal = (await (await fetch(`${base}/api/v1/subagents?since=${since}&include_internal=true`)).json()).items;
  assert.ok(withInternal.some((s) => s.internal));
  const type = facets.types[0];
  const byType = (await (await fetch(`${base}/api/v1/subagents?since=${since}&type=${type}`)).json()).items;
  assert.ok(byType.every((s) => s.agent_type === type));
  assert.equal((await fetch(`${base}/api/v1/subagents`)).status, 400);
  assert.equal((await fetch(`${base}/api/v1/subagents?since=${since}&include_internal=quiza`)).status, 400);
  await api.close();
});

test('AC-38: GET /api/v1/metrics filtra por Directorio y desglosa sumando el total', async () => {
  const { api, base } = await start({ historySize: 300 });
  const since = new Date(0).toISOString();
  const plain = await (await fetch(`${base}/api/v1/metrics?since=${since}`)).json();
  assert.equal(plain.breakdown, null);

  const body = await (await fetch(`${base}/api/v1/metrics?since=${since}&breakdown=true`)).json();
  for (const rows of [body.breakdown.by_directory, body.breakdown.by_model]) {
    const sum = (pick) => rows.reduce((n, r) => n + pick(r), 0);
    assert.equal(sum((r) => r.tokens.output), body.tokens.output);
    assert.equal(sum((r) => r.sessions.working + r.sessions.paused + r.sessions.orphaned), body.sessions.working + body.sessions.paused + body.sessions.orphaned);
  }
  assert.ok(body.breakdown.by_model.some((m) => m.rate && m.cost_breakdown));

  const directory = body.breakdown.by_directory[0].directory;
  const filtered = await (await fetch(`${base}/api/v1/metrics?since=${since}&directory=${encodeURIComponent(directory)}&breakdown=true`)).json();
  assert.deepEqual(filtered.breakdown.by_directory.map((d) => d.directory), [directory]);
  assert.equal(filtered.tokens.output, body.breakdown.by_directory[0].tokens.output);
  assert.equal((await fetch(`${base}/api/v1/metrics?since=${since}&directory=`)).status, 400);
  assert.equal((await fetch(`${base}/api/v1/metrics?since=${since}&breakdown=si`)).status, 400);
  await api.close();
});

test('AC-42: GET /api/v1/mcp-invocations lee las invocaciones MCP simuladas', async () => {
  const { api, base } = await start({ historySize: 1200 });
  const since = new Date(0).toISOString();
  const { items, servers, unused_deferred, facets } = await (await fetch(`${base}/api/v1/mcp-invocations?since=${since}`)).json();
  assert.ok(items.length > 0 && items.every((i) => i.server === 'playwright' && i.scope === 'project'));
  assert.ok(items.some((i) => i.has_image) && items.some((i) => i.status === 'error'));
  assert.equal(servers[0].calls, items.length);
  assert.equal(servers[0].tools.reduce((n, t) => n + t.calls, 0), servers[0].calls);
  assert.ok(servers[0].latency_p50_ms > 0);
  assert.ok(Array.isArray(unused_deferred));
  assert.deepEqual(facets.servers, ['playwright']);
  const session = items[0].session_id;
  const own = (await (await fetch(`${base}/api/v1/mcp-invocations?since=${since}&session_id=${session}`)).json()).items;
  assert.ok(own.every((i) => i.session_id === session));
  assert.equal((await fetch(`${base}/api/v1/mcp-invocations`)).status, 400);
  assert.equal((await fetch(`${base}/api/v1/mcp-invocations?since=${since}&server=`)).status, 400);
  await api.close();
});

test('AC-46: GET /api/v1/agents compara los Tipos y /agents/{type} da su perfil', async () => {
  const { api, base } = await start({ historySize: 600 });
  const since = new Date(0).toISOString();
  const { items, facets } = await (await fetch(`${base}/api/v1/agents?since=${since}`)).json();
  assert.ok(items.length > 0 && facets.projects.length > 0);
  const launches = (await (await fetch(`${base}/api/v1/subagents?since=${since}`)).json()).items.length;
  assert.equal(items.reduce((n, t) => n + t.launches, 0), launches);
  assert.ok(items.every((t) => t.launches === t.foreground + t.background));

  const type = items[0].type ?? 'sin-tipo';
  const profile = await (await fetch(`${base}/api/v1/agents/${encodeURIComponent(type)}?since=${since}`)).json();
  assert.equal(profile.summary.launches, items[0].launches);
  assert.equal(profile.launches.length, items[0].launches);
  assert.ok(profile.tools.length > 0);
  assert.equal((await fetch(`${base}/api/v1/agents`)).status, 400);
  assert.equal((await fetch(`${base}/api/v1/agents/Explore?since=${since}&project=`)).status, 400);
  await api.close();
});

test('AC-52: GET /api/v1/exporter enseña un exportador activo con Turnos exportados, pendientes y fallidos', async () => {
  const { api, base } = await start({ historySize: 800 });
  const body = await (await fetch(`${base}/api/v1/exporter`)).json();
  assert.equal(body.enabled, true);
  assert.equal(body.endpoint_host, 'collector.local:4318');
  assert.equal(body.include_content, false);
  const { pending, exported, failed } = body.counts;
  assert.ok(exported > 0 && failed > 0 && pending >= 0);
  assert.ok(body.recent.length > 0 && body.recent.length <= 50);
  assert.ok(body.recent.every((t) => ['pending', 'exported', 'failed'].includes(t.state) && t.session_id && t.project));
  assert.ok(body.recent.filter((t) => t.state !== 'exported').every((t) => typeof t.last_error === 'string'));
  assert.equal(JSON.stringify(body).includes('authorization'), false);
  await api.close();
});

test('AC-55, AC-56, AC-59: Evaluaciones en memoria, con Puntuación en las Sesiones y en los agentes', async () => {
  const { api, base } = await start({ historySize: 800 });
  const json = (method, path, body) =>
    fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const { items: sessions } = await (await fetch(`${base}/api/v1/sessions`)).json();
  const sessionId = sessions[0].session_id;
  assert.equal(sessions[0].evaluation_score, null);
  const { turns } = await (await fetch(`${base}/api/v1/sessions/${sessionId}`)).json();
  assert.ok(turns.length > 0 && turns.every((t) => typeof t.id === 'string'));

  const saved = await json('PUT', `/api/v1/evaluations/session/${sessionId}`, { score: 1, tags: ['Bug fix'], note: 'Bien' });
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).tags, ['bug-fix']);
  const turn = await json('PUT', `/api/v1/evaluations/turn/${turns[0].id}`, { score: -1, tags: [], note: null });
  assert.equal(turn.status, 200);
  assert.equal((await json('PUT', `/api/v1/evaluations/session/${sessionId}`, { score: null, tags: [], note: null })).status, 400);
  assert.equal((await json('PUT', '/api/v1/evaluations/session/no-existe', { score: 1, tags: [], note: null })).status, 404);
  assert.equal((await json('PUT', '/api/v1/evaluations/herramienta/x', { score: 1, tags: [], note: null })).status, 400);

  const list = await (await fetch(`${base}/api/v1/evaluations`)).json();
  assert.deepEqual(list.items.map((e) => e.object_type), ['turn', 'session']);
  assert.deepEqual(list.tags, [{ tag: 'bug-fix', count: 1 }]);
  assert.equal((await (await fetch(`${base}/api/v1/evaluations?object_type=turn`)).json()).items.length, 1);
  assert.equal((await fetch(`${base}/api/v1/evaluations?score=quiza`)).status, 400);
  assert.deepEqual((await (await fetch(`${base}/api/v1/evaluations/tags`)).json()).items, [{ tag: 'bug-fix', count: 1 }]);

  const after = await (await fetch(`${base}/api/v1/sessions`)).json();
  assert.equal(after.items.find((s) => s.session_id === sessionId).evaluation_score, 1);

  const exported = await fetch(`${base}/api/v1/evaluations/export`);
  assert.match(exported.headers.get('content-type'), /application\/x-ndjson/);
  assert.equal((await exported.text()).trimEnd().split('\n').map((l) => JSON.parse(l)).length, 2);

  const agents = await (await fetch(`${base}/api/v1/agents?since=${new Date(0).toISOString()}`)).json();
  assert.ok(agents.items.every((i) => i.rated_up === 0 && i.rated_down === 0));

  assert.equal((await json('DELETE', `/api/v1/evaluations/session/${sessionId}`)).status, 204);
  assert.equal((await json('DELETE', `/api/v1/evaluations/session/${sessionId}`)).status, 404);
  await api.close();
});

test('AC-63 a AC-65, AC-68: Avisos de inyección, descarte, warnings en los Eventos y estadísticas de Enmascarado', async () => {
  const { api, base } = await start({ historySize: 1500 });
  const since = new Date(0).toISOString();
  const json = (method, path) => fetch(`${base}${path}`, { method });

  const { items, facets } = await (await fetch(`${base}/api/v1/injection-warnings?since=${since}`)).json();
  assert.ok(items.length > 0, 'la simulación incluye páginas con contenido hostil');
  assert.ok(items.every((w) => w.dismissed === false && ['low', 'medium', 'high'].includes(w.severity) && w.source && w.snippet));
  assert.ok(facets.patterns.includes('fake-system-tag') && facets.projects.length > 0);
  assert.equal((await fetch(`${base}/api/v1/injection-warnings`)).status, 400);
  assert.equal((await fetch(`${base}/api/v1/injection-warnings?since=${since}&severity=grave`)).status, 400);

  // El Evento que trajo el aviso lo lleva en `warnings`; el resto, una lista vacía.
  const { items: events } = await (await fetch(`${base}/api/v1/events?limit=500&event_type=tool.post`)).json();
  const flagged = events.find((e) => e.id === items[0].event_id) ?? events.find((e) => e.warnings.length > 0);
  assert.ok(events.every((e) => Array.isArray(e.warnings)));
  assert.ok(flagged.warnings.length > 0);

  const high = items.find((w) => w.severity === 'high');
  const alertsBefore = (await (await fetch(`${base}/api/v1/sessions`)).json()).items.find((s) => s.session_id === high.session_id).injection_alerts;
  assert.ok(alertsBefore > 0);
  assert.equal((await json('PUT', `/api/v1/injection-warnings/${encodeURIComponent(high.id)}/dismissal`)).status, 204);
  const vigentes = (await (await fetch(`${base}/api/v1/injection-warnings?since=${since}`)).json()).items;
  assert.equal(vigentes.some((w) => w.id === high.id), false);
  const descartados = (await (await fetch(`${base}/api/v1/injection-warnings?since=${since}&dismissed=true`)).json()).items;
  assert.deepEqual(descartados.map((w) => w.id), [high.id]);
  const alertsAfter = (await (await fetch(`${base}/api/v1/sessions`)).json()).items.find((s) => s.session_id === high.session_id).injection_alerts;
  assert.equal(alertsAfter, alertsBefore - 1);
  assert.equal((await json('DELETE', `/api/v1/injection-warnings/${encodeURIComponent(high.id)}/dismissal`)).status, 204);
  assert.equal((await json('PUT', '/api/v1/injection-warnings/no-existe/dismissal')).status, 404);

  const stats = await (await fetch(`${base}/api/v1/masking-stats?since=${since}`)).json();
  assert.equal(Object.keys(stats.totals).length, 9);
  assert.ok(stats.items.length > 0 && stats.items.every((i) => i.total > 0 && Object.keys(i.counts).length === 9));
  assert.equal((await fetch(`${base}/api/v1/masking-stats`)).status, 400);
  await api.close();
});

test('AC-71 a AC-73: la eficiencia de la caché en las métricas, su desglose, el detalle y los agentes', async () => {
  const { api, base } = await start({ historySize: 800 });
  const since = new Date(0).toISOString();
  const { cache, breakdown } = await (await fetch(`${base}/api/v1/metrics?since=${since}&breakdown=true`)).json();

  assert.ok(cache.hit_rate > 0 && cache.hit_rate < 1 && cache.read_tokens > 0);
  assert.ok(cache.savings_gross_usd > 0 && cache.savings_net_usd <= cache.savings_gross_usd);
  assert.ok(cache.rewrites > 0 && cache.rewrite_cost_usd > 0, 'la simulación incluye Reescrituras');
  const sum = (rows, key) => rows.reduce((n, r) => n + r.cache[key], 0);
  assert.equal(sum(breakdown.by_directory, 'read_tokens'), cache.read_tokens);
  assert.equal(sum(breakdown.by_model, 'rewrites'), cache.rewrites);
  assert.ok(Math.abs(sum(breakdown.by_directory, 'savings_net_usd') - cache.savings_net_usd) < 1e-4);

  const { items } = await (await fetch(`${base}/api/v1/sessions`)).json();
  const busiest = items.reduce((best, s) => (s.event_count > best.event_count ? s : best));
  const detail = await (await fetch(`${base}/api/v1/sessions/${busiest.session_id}`)).json();
  assert.ok(detail.cache.hit_rate > 0 && Array.isArray(detail.cache_rewrites));
  assert.equal(detail.cache.rewrites, detail.cache_rewrites.length);
  assert.ok(detail.cache_rewrites.every((r) => ['expired', 'model_change', 'compaction', 'other'].includes(r.cause) && r.written_tokens > 0));

  const agents = await (await fetch(`${base}/api/v1/agents?since=${since}`)).json();
  assert.ok(agents.items.every((i) => typeof i.cache_savings_net_usd === 'number'));
  assert.ok(agents.items.some((i) => i.cache_hit_rate > 0));
  const profile = await (await fetch(`${base}/api/v1/agents/${encodeURIComponent(agents.items[0].type)}?since=${since}`)).json();
  assert.ok(profile.launches.every((l) => 'cache_hit_rate' in l && 'cache_savings_net_usd' in l));
  await api.close();
});

test('AC-76 a AC-81, AC-84: Presupuestos en memoria con estado, excepciones, estado para el hook y budget.state', async () => {
  const { api, base, ws } = await start({ historySize: 300 });
  const json = (method, path, body) =>
    fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const messages = [];
  const socket = new WebSocket(ws);
  socket.on('message', (d) => {
    const message = JSON.parse(d.toString());
    if (message.type === 'budget.state') messages.push(message);
  });
  await new Promise((resolve) => socket.on('open', resolve));

  assert.deepEqual((await (await fetch(`${base}/api/v1/budgets`)).json()).items, []);
  assert.equal((await json('POST', '/api/v1/budgets', { scope: 'project_day', limit_usd: 1 })).status, 400);
  assert.equal((await json('PUT', '/api/v1/budgets/no-existe', { scope: 'global_day', limit_usd: 1 })).status, 404);

  // Un límite de un céntimo se supera enseguida con el gasto sintético.
  const created = await json('POST', '/api/v1/budgets', { scope: 'global_day', limit_usd: 0.01 });
  assert.equal(created.status, 201);
  const budget = await created.json();
  assert.equal(budget.state, 'exceeded');
  assert.ok(budget.spent_usd > 0.01);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].budget_id, budget.id);
  assert.equal(messages[0].state, 'exceeded');
  assert.equal(messages[0].previous_state, 'within');

  const { items: sessions } = await (await fetch(`${base}/api/v1/sessions`)).json();
  const { session_id, project } = sessions[0];
  const stop = await (await fetch(`${base}/api/v1/budgets/status?session_id=${session_id}&project=${project}`)).json();
  assert.equal(stop.stop.budget_id, budget.id);
  assert.match(stop.stop.reason, /Presupuesto global del día superado/);
  assert.equal((await fetch(`${base}/api/v1/budgets/status?project=demo`)).status, 400);

  const allowance = await json('POST', `/api/v1/budgets/${budget.id}/allowances`, { project });
  assert.equal(allowance.status, 201);
  assert.equal((await (await fetch(`${base}/api/v1/budgets/status?session_id=${session_id}&project=${project}`)).json()).stop, null);
  assert.equal((await json('POST', `/api/v1/budgets/${budget.id}/allowances`, {})).status, 400);
  assert.equal((await json('DELETE', `/api/v1/budgets/${budget.id}/allowances/${(await allowance.json()).id}`)).status, 204);

  const raised = await (await json('PUT', `/api/v1/budgets/${budget.id}`, { scope: 'global_day', limit_usd: 1000 })).json();
  assert.equal(raised.state, 'within');
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(messages.at(-1).state, 'within');
  assert.equal(messages.at(-1).previous_state, 'exceeded');

  assert.equal((await json('DELETE', `/api/v1/budgets/${budget.id}`)).status, 204);
  assert.equal((await json('DELETE', `/api/v1/budgets/${budget.id}`)).status, 404);
  socket.terminate();
  await api.close();
});

test('una Sesión Cerrada que se retoma con el mismo session_id vuelve a estar viva', async () => {
  const { api, base } = await start({ historySize: 0 });
  const post = (event_type, occurred_at) =>
    fetch(`${base}/api/v1/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schema_version: 1, harness: 'claude-code', project: 'demo', directory: '/code/demo', session_id: 'retomada',
        event_type, native_event_type: 'X', occurred_at, payload: {},
      }),
    });
  const now = Date.now();
  await post('session.started', new Date(now - 60_000).toISOString());
  await post('session.ended', new Date(now - 30_000).toISOString());
  const state = async () => (await (await fetch(`${base}/api/v1/sessions`)).json()).items.find((s) => s.session_id === 'retomada').state;
  assert.equal(await state(), 'closed');
  await post('prompt.submitted', new Date(now).toISOString());
  assert.equal(await state(), 'active');
  await post('session.ended', new Date(now + 1000).toISOString());
  assert.equal(await state(), 'closed');
  await api.close();
});

test('GET /api/v1/events filtra por Proyecto (AC-100)', async () => {
  const { api, base } = await start();
  const all = (await (await fetch(`${base}/api/v1/events?limit=500`)).json()).items;
  const project = all[0].project;
  const own = (await (await fetch(`${base}/api/v1/events?limit=500&project=${encodeURIComponent(project)}`)).json()).items;
  assert.ok(own.length > 0 && own.every((e) => e.project === project));
  assert.equal((await fetch(`${base}/api/v1/events?project=`)).status, 400);
  await api.close();
});

test('AC-126: tras turn.ended, el Subagente sin fin pasa a sin respuesta en el detalle, /subagents y /agents', async () => {
  const { api, base } = await start({ historySize: 0 });
  const post = (event_type, extra = {}) =>
    fetch(`${base}/api/v1/events`, {
      method: 'POST',
      body: JSON.stringify({
        schema_version: 1,
        harness: 'claude-code',
        project: 'demo',
        directory: '/d',
        session_id: 's126',
        event_type,
        native_event_type: 'X',
        occurred_at: new Date().toISOString(),
        payload: {},
        ...extra,
      }),
    });
  await post('prompt.submitted');
  await post('tool.pre', { tool_name: 'Agent', payload: { tool_use_id: 't1', tool_input: { subagent_type: 'Explore', description: 'Buscar' } } });
  const statuses = async () => ({
    detail: (await (await fetch(`${base}/api/v1/sessions/s126`)).json()).subagents.map((s) => s.status),
    list: (await (await fetch(`${base}/api/v1/subagents?since=${new Date(Date.now() - 3600_000).toISOString()}`)).json()).items.map((s) => s.status),
  });
  assert.deepEqual(await statuses(), { detail: ['running'], list: ['running'] });

  await post('turn.ended');
  assert.deepEqual(await statuses(), { detail: ['no_response'], list: ['no_response'] });
  const { items } = await (await fetch(`${base}/api/v1/agents?since=${new Date(Date.now() - 3600_000).toISOString()}`)).json();
  const explore = items.find((a) => a.type === 'Explore');
  assert.equal(explore.running, 0);
  assert.equal(explore.no_response, 1);
  await api.close();
});
