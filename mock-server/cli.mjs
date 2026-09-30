#!/usr/bin/env node
// Uso:
//   node cli.mjs serve [--port 4000] [--interval 1500] [--history 40] [--seed 1] [--no-subscription]
//   node cli.mjs send  [--target http://127.0.0.1:4000] [--count 0] [--interval 1000] [--seed N] [--no-subscription]
import { parseArgs } from 'node:util';
import { createMockApi } from './lib/mock-api.mjs';
import { sendSimulatedEvents } from './lib/sender.mjs';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: 'string', default: process.env.PORT ?? '4000' },
    target: { type: 'string', default: process.env.MOCK_TARGET ?? 'http://127.0.0.1:4000' },
    interval: { type: 'string' },
    history: { type: 'string', default: '40' },
    count: { type: 'string', default: '0' },
    seed: { type: 'string' },
    // Sin suscripción (API key, Bedrock, Vertex) no hay ficha de uso: `usage` es null (AC-132).
    'no-subscription': { type: 'boolean', default: false },
  },
});

const out = (line) => process.stdout.write(`${line}\n`);
const mode = positionals[0];

if (mode === 'serve') {
  const api = createMockApi({
    intervalMs: Number(values.interval ?? process.env.MOCK_INTERVAL_MS ?? 1500),
    historySize: Number(values.history),
    seed: Number(values.seed ?? 1),
    waitingSeeds: true,
    subscriptionSeed: !values['no-subscription'],
  });
  const { port } = await api.listen(Number(values.port));
  out(`Mock de Mandarina en http://0.0.0.0:${port} (API /api/v1, WebSocket /ws)`);
  const stop = async () => {
    await api.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} else if (mode === 'send') {
  out(`Enviando Eventos simulados a ${values.target}…`);
  const stats = await sendSimulatedEvents({
    target: values.target,
    count: Number(values.count),
    intervalMs: Number(values.interval ?? process.env.MOCK_INTERVAL_MS ?? 1000),
    seed: values.seed ? Number(values.seed) : Date.now(),
    subscription: !values['no-subscription'],
    log: out,
  });
  out(`Enviados ${stats.sent}: ${stats.accepted} aceptados, ${stats.rejected} rechazados, ${stats.failed} fallidos`);
  process.exit(stats.rejected + stats.failed > 0 ? 1 : 0);
} else {
  out('Uso: node cli.mjs serve | send   (ver mock-server/README.md)');
  process.exit(2);
}
