import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createMockApi } from '../lib/mock-api.mjs';
import { createSubscriptionBook, seedReading } from '../lib/mock-subscription.mjs';
import { sendSimulatedEvents } from '../lib/sender.mjs';

const epoch = (iso) => Math.floor(Date.parse(iso) / 1000);
const IN_1H = '2026-09-25T13:00:00.000Z';
const IN_2D = '2026-09-27T12:00:00.000Z';

async function start(options) {
  const api = createMockApi({ intervalMs: 0, historySize: 0, ...options });
  const { port } = await api.listen(0, '127.0.0.1');
  return { api, base: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}/ws` };
}

const put = (base, body) =>
  fetch(`${base}/api/v1/subscription-usage`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const current = async (base) => (await (await fetch(`${base}/api/v1/subscription-usage`)).json()).usage;

test('AC-132: el libro calcula remaining y estado como el backend', () => {
  let now = new Date('2026-09-25T12:00:00.000Z');
  const book = createSubscriptionBook({ now: () => now });
  assert.equal(book.current(), null);

  const ok = book.put({ five_hour: { used_percentage: 85, resets_at: epoch(IN_1H) }, seven_day: { used_percentage: 100, resets_at: epoch(IN_2D) } });
  assert.deepEqual(ok, { ok: true });
  const usage = book.current();
  assert.deepEqual(usage.five_hour, { used_percent: 85, remaining_percent: 15, resets_at: IN_1H, status: 'near' });
  assert.equal(usage.seven_day.status, 'exhausted');

  now = new Date('2026-09-25T13:00:01.000Z');
  assert.equal(book.current().five_hour.status, 'reset_pending');
  assert.equal(book.current().seven_day.status, 'exhausted');
});

test('AC-132: una ventana ausente conserva la anterior solo si sigue vigente', () => {
  let now = new Date('2026-09-25T12:00:00.000Z');
  const book = createSubscriptionBook({ now: () => now });
  book.put({ five_hour: { used_percentage: 10, resets_at: epoch(IN_1H) }, seven_day: { used_percentage: 20, resets_at: epoch(IN_2D) } });
  book.put({ five_hour: { used_percentage: 30, resets_at: epoch(IN_1H) } });
  assert.equal(book.current().seven_day.used_percent, 20);

  now = new Date('2026-09-25T14:00:00.000Z');
  book.put({ seven_day: { used_percentage: 25, resets_at: epoch(IN_2D) } });
  assert.equal(book.current().five_hour, null);
});

test('AC-132: GET responde usage null sin suscripción', async () => {
  const { api, base } = await start();
  assert.deepEqual(await (await fetch(`${base}/api/v1/subscription-usage`)).json(), { usage: null });
  await api.close();
});

test('AC-132: con datos semilla la cuenta arranca con suscripción', async () => {
  const { api, base } = await start({ subscriptionSeed: true });
  const usage = await current(base);
  assert.equal(usage.five_hour.status, 'near');
  assert.equal(usage.seven_day.status, 'comfortable');
  assert.ok(Date.parse(usage.five_hour.resets_at) > Date.now());
  await api.close();
});

test('AC-132: PUT responde 204, guarda la lectura y valida el contrato', async () => {
  const { api, base } = await start();
  assert.equal((await put(base, { session_id: 's1', five_hour: { used_percentage: 40, resets_at: Math.floor(Date.now() / 1000) + 3600 } })).status, 204);
  assert.equal((await current(base)).five_hour.used_percent, 40);
  assert.equal((await current(base)).seven_day, null);

  const soon = Math.floor(Date.now() / 1000) + 3600;
  for (const bad of [
    {},
    { session_id: 's1' },
    { five_hour: { used_percentage: 101, resets_at: soon } },
    { five_hour: { used_percentage: 5, resets_at: 1.5 } },
    { five_hour: { used_percentage: 5 } },
    { five_hour: { used_percentage: 5, resets_at: soon, extra: 1 } },
    { five_hour: { used_percentage: 5, resets_at: soon }, plan: 'max' },
  ]) {
    assert.equal((await put(base, bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await current(base)).five_hour.used_percent, 40);
  await api.close();
});

test('AC-132: PUT difunde subscription.usage por /ws', async () => {
  const { api, base, ws } = await start();
  const client = new WebSocket(ws);
  await new Promise((r) => client.once('open', r));
  const message = new Promise((r) => client.once('message', (d) => r(JSON.parse(d.toString()))));

  await put(base, { five_hour: { used_percentage: 12, resets_at: Math.floor(Date.now() / 1000) + 3600 } });
  const received = await message;

  assert.equal(received.type, 'subscription.usage');
  assert.equal(received.usage.five_hour.used_percent, 12);
  assert.equal(received.usage.seven_day, null);
  client.close();
  await api.close();
});

test('AC-132: la lectura semilla se ajusta al reloj', () => {
  const now = new Date('2026-09-25T12:00:00.000Z');
  const reading = seedReading(now);
  assert.ok(reading.five_hour.resets_at * 1000 > now.getTime());
  assert.ok(reading.seven_day.resets_at * 1000 > reading.five_hour.resets_at * 1000);
});

test('AC-132: el simulador envía lecturas de suscripción con --subscription', async () => {
  const { api, base } = await start();
  const stats = await sendSimulatedEvents({ target: base, count: 3, intervalMs: 0, seed: 3, subscription: true });
  assert.equal(stats.accepted, 3);
  const usage = await current(base);
  assert.equal(usage.five_hour.status, 'near');
  await api.close();
});

test('AC-132: sin --subscription el simulador no toca la suscripción', async () => {
  const { api, base } = await start();
  await sendSimulatedEvents({ target: base, count: 3, intervalMs: 0, seed: 3 });
  assert.equal(await current(base), null);
  await api.close();
});

test('AC-133: /metrics del mock ya no expone llamadas, prompts ni Bloqueos', async () => {
  const { api, base } = await start({ historySize: 40 });
  const body = await (await fetch(`${base}/api/v1/metrics?since=${new Date(0).toISOString()}&breakdown=true`)).json();
  assert.deepEqual(Object.keys(body.activity), ['events']);
  for (const row of [...body.breakdown.by_directory, ...body.breakdown.by_model]) assert.equal('activity' in row, false);
  await api.close();
});
