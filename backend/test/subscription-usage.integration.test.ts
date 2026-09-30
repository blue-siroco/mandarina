import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

let now = new Date('2026-09-25T12:00:00.000Z');
const clock = { now: () => now };
const epoch = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const IN_1H = '2026-09-25T13:00:00.000Z';
const IN_2D = '2026-09-27T12:00:00.000Z';

let app: FastifyInstance;
let dir: string;

const start = async (databaseFile = ':memory:') => {
  app = await buildApp({ databaseFile, clock, budgets: { intervalMs: 0 } });
  await app.ready();
};

beforeEach(async () => {
  now = new Date('2026-09-25T12:00:00.000Z');
  dir = mkdtempSync(join(tmpdir(), 'mandarina-subscription-'));
  await start();
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const put = (payload: unknown) => app.inject({ method: 'PUT', url: '/api/v1/subscription-usage', payload: payload as object });
const get = async () => (await app.inject({ method: 'GET', url: '/api/v1/subscription-usage' })).json();

const both = {
  session_id: 's1',
  five_hour: { used_percentage: 23.5, resets_at: epoch(IN_1H) },
  seven_day: { used_percentage: 85, resets_at: epoch(IN_2D) },
};

describe('GET /api/v1/subscription-usage', () => {
  it('AC-131: sin lectura responde usage null', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/subscription-usage' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ usage: null });
  });

  it('AC-131: devuelve la lectura con remaining y estado por ventana', async () => {
    expect((await put(both)).statusCode).toBe(204);
    expect(await get()).toEqual({
      usage: {
        five_hour: { used_percent: 23.5, remaining_percent: 76.5, resets_at: IN_1H, status: 'comfortable' },
        seven_day: { used_percent: 85, remaining_percent: 15, resets_at: IN_2D, status: 'near' },
        updated_at: '2026-09-25T12:00:00.000Z',
      },
    });
  });

  it('AC-131: el estado se recalcula al consultar con el reloj', async () => {
    await put(both);
    now = new Date('2026-09-25T13:30:00.000Z');
    const { usage } = await get();
    expect(usage.five_hour.status).toBe('reset_pending');
    expect(usage.seven_day.status).toBe('near');
    // updated_at sigue siendo el de la llegada, no el de la consulta.
    expect(usage.updated_at).toBe('2026-09-25T12:00:00.000Z');
  });
});

describe('PUT /api/v1/subscription-usage', () => {
  it('AC-130: una sola ventana es válida y la otra queda null', async () => {
    expect((await put({ five_hour: { used_percentage: 100, resets_at: epoch(IN_1H) } })).statusCode).toBe(204);
    const { usage } = await get();
    expect(usage.five_hour).toMatchObject({ remaining_percent: 0, status: 'exhausted' });
    expect(usage.seven_day).toBeNull();
  });

  it('AC-130: rechaza con 400 sin ventanas, valores fuera de rango y campos desconocidos, sin tocar lo guardado', async () => {
    await put(both);
    const before = await get();
    const bad = [
      {},
      { session_id: 's1' },
      { five_hour: { used_percentage: 101, resets_at: epoch(IN_1H) } },
      { five_hour: { used_percentage: -1, resets_at: epoch(IN_1H) } },
      { five_hour: { used_percentage: 5, resets_at: 1.5 } },
      { five_hour: { used_percentage: 5 } },
      { five_hour: { used_percentage: 5, resets_at: epoch(IN_1H), extra: true } },
      { ...both, plan: 'max' },
      { five_hour: { used_percentage: 5, resets_at: 1e20 } },
      { five_hour: { used_percentage: 5, resets_at: -1 } },
      { ...both, session_id: 'x'.repeat(201) },
    ];
    for (const payload of bad) expect((await put(payload)).statusCode, JSON.stringify(payload)).toBe(400);
    expect(await get()).toEqual(before);
  });

  it('AC-130: es la última lectura de la cuenta: sustituye a la anterior, no se acumula por Sesión', async () => {
    await put(both);
    await put({ session_id: 's2', five_hour: { used_percentage: 50, resets_at: epoch(IN_1H) }, seven_day: { used_percentage: 60, resets_at: epoch(IN_2D) } });
    const { usage } = await get();
    expect(usage.five_hour.used_percent).toBe(50);
    expect(usage.seven_day.used_percent).toBe(60);
  });

  it('AC-130: una ventana ausente conserva la anterior solo si su reinicio sigue en el futuro', async () => {
    await put(both);
    await put({ five_hour: { used_percentage: 30, resets_at: epoch(IN_1H) } });
    expect((await get()).usage.seven_day).toMatchObject({ used_percent: 85 });

    // Pasa la ventana de 5 h: la semanal sigue vigente y la de 5 h caducada no se conserva.
    now = new Date('2026-09-25T14:00:00.000Z');
    await put({ seven_day: { used_percentage: 90, resets_at: epoch(IN_2D) } });
    const { usage } = await get();
    expect(usage.five_hour).toBeNull();
    expect(usage.seven_day.used_percent).toBe(90);
  });

  it('AC-130: la lectura sobrevive a un reinicio del servidor', async () => {
    await app.close();
    const file = join(dir, 'mandarina.sqlite');
    await start(file);
    await put(both);
    await app.close();
    await start(file);
    expect((await get()).usage.five_hour).toMatchObject({ used_percent: 23.5 });
  });
});

describe('WebSocket', () => {
  it('AC-130: difunde subscription.usage con el estado ya calculado y no difunde un 400', async () => {
    const socket = await app.injectWS('/ws');
    const messages: unknown[] = [];
    socket.on('message', (data) => messages.push(JSON.parse(data.toString())));

    expect((await put({})).statusCode).toBe(400);
    expect((await put(both)).statusCode).toBe(204);
    await vi.waitFor(() => expect(messages).toHaveLength(1));
    socket.terminate();

    expect(messages[0]).toEqual({
      type: 'subscription.usage',
      usage: {
        five_hour: { used_percent: 23.5, remaining_percent: 76.5, resets_at: IN_1H, status: 'comfortable' },
        seven_day: { used_percent: 85, remaining_percent: 15, resets_at: IN_2D, status: 'near' },
        updated_at: '2026-09-25T12:00:00.000Z',
      },
    });
  });
});
