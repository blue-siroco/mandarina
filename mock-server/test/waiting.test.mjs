import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createMockApi } from '../lib/mock-api.mjs';
import { createSimulation, WAITING_SEED_IDS } from '../lib/scenario.mjs';
import { currentWait, pendingWaits } from '../lib/mock-waiting.mjs';

// Eventos mínimos con la forma del mock (payload nativo del hook).
let seq = 0;
const at = (s) => new Date(Date.UTC(2026, 8, 30, 10, 0, s)).toISOString();
const ev = (event_type, s, extra = {}) => ({ id: `e${++seq}`, event_type, subagent_id: null, tool_name: null, occurred_at: at(s), payload: {}, ...extra });
const turn = (...rest) => [ev('session.started', 0), ev('prompt.submitted', 1), ...rest];

test('AC-93: un permiso pedido con un Turno en curso es una espera hasta el siguiente Evento de su carril', () => {
  const ask = ev('permission.requested', 3, { tool_name: 'Bash', payload: { tool_input: { command: 'npm i\nsegunda línea' } } });
  const wait = currentWait(turn(ev('tool.pre', 2, { tool_name: 'Bash' }), ask));
  assert.deepEqual({ ...wait, event_id: undefined, lane: undefined }, {
    since: at(3), reason: 'permission', tool: 'Bash', summary: 'npm i', subagent_id: null, event_id: undefined, lane: undefined,
  });
  assert.equal(currentWait(turn(ev('tool.pre', 2), ask, ev('tool.post', 4, { tool_name: 'Bash' }))), null);
});

test('AC-93: la pregunta abierta (AskUserQuestion) espera hasta su tool.post y prevalece sobre el permiso', () => {
  const question = ev('tool.pre', 2, { tool_name: 'AskUserQuestion', payload: { tool_input: { questions: [{ question: '¿Vitest o Jest?' }] } } });
  const perm = ev('permission.requested', 3, { tool_name: 'AskUserQuestion' });
  const waits = pendingWaits(turn(question, perm));
  assert.equal(waits.length, 1);
  assert.deepEqual([waits[0].reason, waits[0].summary], ['question', '¿Vitest o Jest?']);
  assert.equal(currentWait(turn(question, ev('tool.post', 4, { tool_name: 'AskUserQuestion' }))), null);
});

test('AC-93: Stop no es esperar y la inactividad solo cuenta con un Turno en curso', () => {
  const idle = (s) => ev('session.notified', s, { payload: { notification_type: 'idle_prompt', message: 'Claude is waiting for your input' } });
  assert.equal(currentWait([...turn(ev('turn.ended', 2)), idle(3)]), null);
  assert.equal(currentWait([ev('session.started', 0), idle(1)]), null);
  assert.equal(currentWait(turn(idle(2)))?.reason, 'idle');
  // Cualquier Evento que no sea un aviso termina la inactividad.
  assert.equal(currentWait(turn(idle(2), ev('tool.pre', 3))), null);
});

test('AC-93: el permiso de un Subagente solo lo termina un Evento de su carril', () => {
  const sub = { subagent_id: 'agent-x' };
  const ask = ev('permission.requested', 3, { ...sub, tool_name: 'Write' });
  const rows = turn(ev('subagent.started', 2, sub), ask);
  assert.equal(currentWait(rows)?.subagent_id, 'agent-x');
  assert.equal(currentWait([...rows, ev('tool.post', 4, { tool_name: 'Read' })])?.subagent_id, 'agent-x');
  assert.equal(currentWait([...rows, ev('tool.post', 4, sub)]), null);
});

test('AC-93: una notificación de permiso sin herramienta se completa con el PermissionRequest posterior', () => {
  const note = ev('session.notified', 2, { payload: { notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' } });
  const ask = ev('permission.requested', 3, { tool_name: 'Bash', payload: { tool_input: { command: 'ls' } } });
  assert.equal(currentWait(turn(note))?.tool, null);
  const merged = pendingWaits(turn(note, ask));
  assert.equal(merged.length, 1);
  assert.deepEqual([merged[0].since, merged[0].tool, merged[0].summary], [at(2), 'Bash', 'ls']);
});

async function start(options) {
  const api = createMockApi({ intervalMs: 0, historySize: 5, waitingSeeds: true, ...options });
  const { port } = await api.listen(0, '127.0.0.1');
  return { api, base: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}/ws` };
}

const WAIT_KEYS = ['reason', 'since', 'subagent', 'summary', 'tool'];
// Forma de `SessionSummary.waiting` en api-spec.yaml (additionalProperties: false).
function assertWaitingShape(waiting) {
  assert.deepEqual(Object.keys(waiting).sort(), WAIT_KEYS);
  assert.ok(['permission', 'question', 'idle'].includes(waiting.reason));
  assert.ok(!Number.isNaN(Date.parse(waiting.since)));
  for (const key of ['tool', 'summary']) assert.ok(waiting[key] === null || typeof waiting[key] === 'string');
  assert.ok(waiting.subagent === null || (typeof waiting.subagent.id === 'string' && 'type' in waiting.subagent));
}

test('AC-93: las Sesiones semilla esperan por permiso, por pregunta y en un Subagente (lista y detalle)', async () => {
  const { api, base } = await start();
  const { items } = await (await fetch(`${base}/api/v1/sessions`)).json();
  const byId = new Map(items.map((s) => [s.session_id, s]));

  const permission = byId.get(WAITING_SEED_IDS.permission);
  assert.equal(permission.activity, 'waiting');
  assert.deepEqual([permission.waiting.reason, permission.waiting.tool, permission.waiting.summary, permission.waiting.subagent], ['permission', 'Bash', 'npm install --save-dev vitest', null]);

  const question = byId.get(WAITING_SEED_IDS.question);
  assert.deepEqual([question.activity, question.waiting.reason, question.waiting.tool], ['waiting', 'question', 'AskUserQuestion']);
  assert.equal(question.waiting.summary, '¿Qué estrategia de migración prefieres?');

  const sub = byId.get(WAITING_SEED_IDS.subagent);
  assert.equal(sub.waiting.reason, 'permission');
  assert.deepEqual(sub.waiting.subagent, { id: 'agent-5eed01', type: 'Plan' });

  for (const s of items) {
    if (s.activity === 'waiting') assertWaitingShape(s.waiting);
    else assert.equal(s.waiting, null);
  }
  const detail = await (await fetch(`${base}/api/v1/sessions/${WAITING_SEED_IDS.subagent}`)).json();
  assert.deepEqual(detail.waiting, sub.waiting);
  assert.equal(detail.activity, 'waiting');
  await api.close();
});

test('AC-93: GET /metrics cuenta las Sesiones esperando aparte y el desglose no las suma a working ni paused', async () => {
  const { api, base } = await start();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const body = await (await fetch(`${base}/api/v1/metrics?since=${since}&breakdown=true`)).json();
  const { sessions } = body;
  assert.ok(sessions.waiting >= 3);
  assert.equal(sessions.working + sessions.paused + sessions.waiting + sessions.orphaned + sessions.closed, sessions.total);
  const sum = (rows, key) => rows.reduce((n, r) => n + r.sessions[key], 0);
  assert.equal(sum(body.breakdown.by_directory, 'working') + sum(body.breakdown.by_directory, 'paused'), sessions.working + sessions.paused);
  await api.close();
});

test('AC-93: el mock acepta los Eventos nuevos, los difunde por /ws y el siguiente Evento termina la espera', async () => {
  const { api, base, ws } = await start({ historySize: 0, waitingSeeds: false });
  const client = new WebSocket(ws);
  const received = [];
  client.on('message', (raw) => received.push(JSON.parse(raw)));
  await new Promise((resolve) => client.on('open', resolve));

  const now = Date.now();
  const post = (event_type, native_event_type, s, extra = {}) =>
    fetch(`${base}/api/v1/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schema_version: 1, harness: 'claude-code', project: 'p', directory: '/p', session_id: 's1', event_type, native_event_type,
        occurred_at: new Date(now + s * 1000).toISOString(), payload: {}, ...extra,
      }),
    });
  const state = async () => (await (await fetch(`${base}/api/v1/sessions/s1`)).json()).activity;

  for (const [type, native, s] of [['session.started', 'SessionStart', -4], ['prompt.submitted', 'UserPromptSubmit', -3], ['tool.pre', 'PreToolUse', -2]]) {
    assert.equal((await post(type, native, s, type === 'tool.pre' ? { tool_name: 'Bash' } : {})).status, 202);
  }
  assert.equal(await state(), 'working');
  assert.equal((await post('permission.requested', 'PermissionRequest', -1, { tool_name: 'Bash', payload: { tool_input: { command: 'ls' } } })).status, 202);
  assert.equal(await state(), 'waiting');
  assert.equal((await post('session.notified', 'Notification', 0, { payload: { notification_type: 'permission_prompt', message: 'x' } })).status, 202);
  assert.equal(await state(), 'waiting');
  await post('tool.post', 'PostToolUse', 1, { tool_name: 'Bash' });
  assert.equal(await state(), 'working');

  await new Promise((resolve) => setTimeout(resolve, 50));
  const types = received.filter((m) => m.type === 'event.ingested').map((m) => m.event.event_type);
  assert.ok(types.includes('permission.requested') && types.includes('session.notified'));
  assert.equal((await fetch(`${base}/api/v1/events?event_type=permission.requested`)).status, 200);
  client.close();
  await api.close();
});

test('AC-93: Cerrada u Huérfana => sin espera', async () => {
  const { api, base } = await start({ historySize: 0, waitingSeeds: false });
  const old = Date.now() - 40 * 60_000;
  const ingest = (type, native, s, extra = {}) =>
    api.ingest({ schema_version: 1, harness: 'claude-code', project: 'p', directory: '/p', session_id: 'old', event_type: type, native_event_type: native, occurred_at: new Date(old + s).toISOString(), payload: {}, ...extra }, new Date(old + s));
  ingest('session.started', 'SessionStart', 0);
  ingest('prompt.submitted', 'UserPromptSubmit', 1);
  ingest('permission.requested', 'PermissionRequest', 2, { tool_name: 'Bash' });
  const detail = await (await fetch(`${base}/api/v1/sessions/old`)).json();
  assert.deepEqual([detail.state, detail.activity, detail.waiting], ['orphaned', null, null]);
  await api.close();
});

test('AC-93: el simulador emite permisos, preguntas, inactividad y el Evento que termina la espera, con el normalizador del Adaptador', () => {
  const sim = createSimulation({ seed: 4, waits: true });
  const events = Array.from({ length: 4000 }, () => sim.next(new Date('2026-09-30T10:00:00Z')));
  const natives = new Set(events.map((e) => e.native_event_type));
  assert.ok(natives.has('PermissionRequest') && natives.has('Notification'));
  const kinds = new Set(events.filter((e) => e.native_event_type === 'Notification').map((e) => e.payload.notification_type));
  assert.deepEqual([...kinds].sort(), ['idle_prompt', 'permission_prompt']);
  for (const e of events.filter((x) => x.native_event_type === 'PermissionRequest')) assert.equal(e.event_type, 'permission.requested');
  for (const e of events.filter((x) => x.native_event_type === 'Notification')) assert.equal(e.event_type, 'session.notified');

  const questions = events.filter((e) => e.event_type === 'tool.pre' && e.tool_name === 'AskUserQuestion');
  assert.ok(questions.length > 0);
  // La respuesta (tool.post con el mismo tool_use_id) termina la pregunta.
  for (const q of questions) assert.ok(events.some((e) => e.event_type === 'tool.post' && e.payload.tool_use_id === q.payload.tool_use_id));
});

test('AC-93: sin waits la simulación no emite Eventos de espera (las semillas existentes no cambian)', () => {
  const sim = createSimulation({ seed: 4 });
  const events = Array.from({ length: 2000 }, () => sim.next(new Date('2026-09-30T10:00:00Z')));
  assert.equal(events.some((e) => WAIT_TYPES.has(e.event_type) || e.tool_name === 'AskUserQuestion'), false);
});
const WAIT_TYPES = new Set(['permission.requested', 'session.notified']);
