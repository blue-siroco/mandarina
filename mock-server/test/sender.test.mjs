import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockApi } from '../lib/mock-api.mjs';
import { sendSimulatedEvents } from '../lib/sender.mjs';

test('envía el número de Eventos pedido y todos son aceptados por el contrato', async () => {
  // El propio mock valida el contrato: si el simulador generase Eventos
  // inválidos, aquí saldrían como rechazados.
  const api = createMockApi({ intervalMs: 0, historySize: 0 });
  const { port } = await api.listen(0, '127.0.0.1');

  const stats = await sendSimulatedEvents({ target: `http://127.0.0.1:${port}/`, count: 25, intervalMs: 0, seed: 9 });

  assert.deepEqual(stats, { sent: 25, accepted: 25, rejected: 0, failed: 0 });
  assert.equal(api.events.length, 25);
  await api.close();
});

test('cuenta como fallidos los envíos a un backend caído', async () => {
  const stats = await sendSimulatedEvents({ target: 'http://127.0.0.1:9', count: 2, intervalMs: 0 });
  assert.equal(stats.failed, 2);
});
