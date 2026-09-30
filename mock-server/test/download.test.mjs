import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockApi } from '../lib/mock-api.mjs';

async function start(options) {
  const api = createMockApi({ intervalMs: 0, historySize: 30, ...options });
  const { port } = await api.listen(0, '127.0.0.1');
  return { api, base: `http://127.0.0.1:${port}/api/v1` };
}

// Se construye por partes para no dejar un token con forma real en el fichero.
const SECRET = ['ghp', '_abcdefghijklmnopqrstuvwxyz0123456789'].join('');

function event(type, extra = {}) {
  return {
    schema_version: 1,
    harness: 'claude-code',
    project: 'demo',
    directory: '/d',
    session_id: 'sesion-secreta-1',
    event_type: type,
    native_event_type: 'X',
    occurred_at: new Date().toISOString(),
    payload: {},
    ...extra,
  };
}

function withSecretSession(api) {
  api.ingest(event('prompt.submitted', { payload: { prompt: `usa el token ${SECRET}` } }));
  api.ingest(event('tool.pre', { tool_name: 'Bash', payload: { tool_input: { command: `curl -H "Authorization: Bearer ${SECRET}"` } } }));
  api.ingest(event('tool.blocked', { tool_name: 'Bash', block: { rule: 'secrets', reason: `token ${SECRET}` }, payload: { tool_input: { command: 'x' } } }));
  api.ingest(event('turn.ended'));
}

const lines = async (response) => (await response.text()).trim().split('\n').map((l) => JSON.parse(l));

test('AC-144/AC-146: la descarga de Eventos es x-ndjson con cabecera en la primera línea y un Evento por línea', async () => {
  const { api, base } = await start();
  const response = await fetch(`${base}/events/export`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/x-ndjson');
  assert.match(response.headers.get('content-disposition'), /^attachment; filename="mandarina-eventos-\d{4}-\d{2}-\d{2}\.jsonl"$/);
  const [first, ...rest] = await lines(response);
  assert.equal(first.export.kind, 'events');
  assert.equal(first.export.include_content, false);
  assert.deepEqual(first.export.filters, {});
  assert.deepEqual([first.export.total, first.export.exported, first.export.truncated, first.export.omitted], [30, 30, false, 0]);
  assert.equal(rest.length, 30);
  assert.ok(rest.every((e, i) => i === 0 || rest[i - 1].received_at <= e.received_at));
  await api.close();
});

test('AC-142/AC-143: sin content los Eventos no llevan payload ni block.reason; los campos son los del contrato', async () => {
  const { api, base } = await start({ historySize: 0 });
  withSecretSession(api);
  const [, ...items] = await lines(await fetch(`${base}/events/export?session_id=sesion-secreta-1`));
  assert.equal(items.length, 4);
  const expected = ['block', 'directory', 'event_type', 'harness', 'id', 'native_event_type', 'occurred_at', 'project', 'received_at', 'session_id', 'subagent_id', 'tool_name'];
  for (const e of items) assert.deepEqual(Object.keys(e).sort(), expected);
  assert.deepEqual(items[2].block, { rule: 'secrets' });
  assert.equal(items[0].block, null);
  await api.close();
});

test('AC-143: con content=true llevan payload y block.reason, y ningún secreto sale en claro', async () => {
  const { api, base } = await start({ historySize: 0 });
  withSecretSession(api);
  const text = await (await fetch(`${base}/events/export?session_id=sesion-secreta-1&content=true`)).text();
  assert.ok(!text.includes(SECRET));
  const [head, ...items] = text.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(head.export.include_content, true);
  assert.ok('payload' in items[0]);
  assert.match(items[2].block.reason, /REDACTED/);

  const session = await (await fetch(`${base}/sessions/sesion-secreta-1/export?content=true`)).text();
  assert.ok(!session.includes(SECRET));
  await api.close();
});

test('AC-144: filtra por project, session_id, event_type[], tool[] y since', async () => {
  const { api, base } = await start({ historySize: 0 });
  withSecretSession(api);
  api.ingest(event('tool.pre', { project: 'otro', session_id: 'otra', tool_name: 'Read' }));
  const count = async (query) => (await lines(await fetch(`${base}/events/export?${query}`)))[0].export.exported;
  assert.equal(await count('project=otro'), 1);
  assert.equal(await count('session_id=sesion-secreta-1'), 4);
  assert.equal(await count('event_type=tool.pre&event_type=tool.blocked'), 3);
  assert.equal(await count('tool=Bash'), 2);
  assert.equal(await count('tool=Bash&tool=Read'), 3);
  assert.equal(await count(`since=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`), 0);
  const [head] = await lines(await fetch(`${base}/events/export?project=otro&tool=Read`));
  assert.deepEqual(head.export.filters, { project: 'otro', tool: ['Read'] });
  await api.close();
});

test('AC-143/AC-144: content, event_type, since o filtros vacíos inválidos responden 400 con message', async () => {
  const { api, base } = await start();
  for (const query of ['content=quizas', 'event_type=nope', 'since=ayer', 'project=', 'tool=']) {
    for (const path of ['events/export', 'events/export/preview']) {
      const response = await fetch(`${base}/${path}?${query}`);
      assert.equal(response.status, 400, `${path}?${query}`);
      assert.equal(typeof (await response.json()).message, 'string');
    }
  }
  assert.equal((await fetch(`${base}/sessions/x/export?content=1`)).status, 400);
  await api.close();
});

test('AC-144: sin coincidencias responde 200 con solo la cabecera', async () => {
  const { api, base } = await start();
  const items = await lines(await fetch(`${base}/events/export?project=inexistente`));
  assert.equal(items.length, 1);
  assert.equal(items[0].export.total, 0);
  await api.close();
});

test('AC-145: con el tope bajado salen los más recientes y la cabecera lo dice', async () => {
  const { api, base } = await start({ downloadLimit: 10 });
  const all = (await (await fetch(`${base}/events?limit=500`)).json()).items;
  const [head, ...items] = await lines(await fetch(`${base}/events/export`));
  assert.deepEqual([head.export.total, head.export.exported, head.export.truncated, head.export.omitted], [30, 10, true, 20]);
  assert.deepEqual(items.map((e) => e.id), all.slice(0, 10).reverse().map((e) => e.id));
  await api.close();
});

test('AC-145/AC-143: la vista previa da recuento y campos según content, sin descargar', async () => {
  const { api, base } = await start({ downloadLimit: 10 });
  const plain = await (await fetch(`${base}/events/export/preview`)).json();
  assert.deepEqual([plain.total, plain.exported, plain.truncated, plain.omitted], [30, 10, true, 20]);
  assert.ok(!plain.fields.includes('payload'));
  assert.ok(plain.fields.includes('block.rule'));
  const withContent = await (await fetch(`${base}/events/export/preview?content=true`)).json();
  assert.ok(withContent.fields.includes('payload') && withContent.fields.includes('block.reason'));
  await api.close();
});

test('AC-142: la Descarga de Sesión es JSON con export, session y events, y nombre por id corto', async () => {
  const { api, base } = await start({ historySize: 0 });
  withSecretSession(api);
  const response = await fetch(`${base}/sessions/sesion-secreta-1/export`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="mandarina-sesion-sesion-s.json"');
  const body = await response.json();
  assert.equal(body.export.kind, 'session');
  assert.equal(body.export.include_content, false);
  assert.equal(body.export.exported, 4);
  assert.equal(body.session.session_id, 'sesion-secreta-1');
  assert.equal(body.events.length, 4);
  assert.ok(body.events.every((e) => !('payload' in e)));
  assert.equal((await fetch(`${base}/sessions/nada/export`)).status, 404);
  assert.equal((await fetch(`${base}/sessions/nada/export/preview`)).status, 404);
  await api.close();
});

test('AC-142/AC-143: la Sesión sin content no lleva prompt, task, result ni summary; con content sí', async () => {
  const { api, base } = await start({ historySize: 0 });
  withSecretSession(api);
  const plain = await (await fetch(`${base}/sessions/sesion-secreta-1/export`)).json();
  assert.ok(plain.session.turns.length > 0);
  assert.ok(plain.session.turns.every((t) => !('prompt' in t)));
  assert.ok(plain.session.blocks.every((b) => !('summary' in b) && !('reason' in b)));
  assert.ok(plain.session.subagents.every((s) => !('task' in s) && !('result' in s) && s.tools.every((t) => !('summary' in t))));
  const full = await (await fetch(`${base}/sessions/sesion-secreta-1/export?content=true`)).json();
  assert.equal(full.export.include_content, true);
  assert.ok(full.session.turns.every((t) => 'prompt' in t));
  assert.ok(full.session.blocks.length > 0 && full.session.blocks.every((b) => 'summary' in b));
  await api.close();
});

test('AC-145: la Descarga de Sesión también se trunca y su vista previa coincide', async () => {
  const { api, base } = await start({ historySize: 0, downloadLimit: 2 });
  withSecretSession(api);
  const body = await (await fetch(`${base}/sessions/sesion-secreta-1/export`)).json();
  assert.deepEqual([body.export.total, body.export.exported, body.export.truncated, body.export.omitted], [4, 2, true, 2]);
  assert.equal(body.events.length, 2);
  const preview = await (await fetch(`${base}/sessions/sesion-secreta-1/export/preview`)).json();
  assert.deepEqual([preview.total, preview.exported, preview.truncated, preview.omitted], [4, 2, true, 2]);
  await api.close();
});
