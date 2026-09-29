import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const SINCE = minutesAgo(120).toISOString();

let app: FastifyInstance;
let home: string;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'mandarina-cache-'));
  app = await buildApp({ databaseFile: ':memory:', claudeHomeMount: home, clock: { now: () => NOW } });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(home, { recursive: true, force: true });
});

async function ingest(eventType: string, at: Date, options: { subagent?: string; payload?: Record<string, unknown>; directory?: string } = {}) {
  await app.inject({
    method: 'POST',
    url: '/api/v1/events',
    payload: {
      schema_version: 1,
      harness: 'claude-code',
      project: 'demo',
      directory: options.directory ?? '/code/demo',
      session_id: 's1',
      subagent_id: options.subagent ?? null,
      event_type: eventType,
      native_event_type: 'X',
      occurred_at: at.toISOString(),
      transcript_path: '/home/dev/.claude/projects/demo/s1.jsonl',
      payload: options.payload ?? {},
    },
  });
}

function writeTranscript(relative: string, lines: object[]) {
  const file = join(home, 'projects', 'demo', relative);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'));
}

const reply = (id: string, model: string, minutes: number, usage: Record<string, number>) => ({
  type: 'assistant',
  timestamp: minutesAgo(minutes).toISOString(),
  message: { id, model, usage },
});

/** Sonnet 5 en el agente principal (una Reescritura por caducidad) y Haiku 4.5 en un Subagente. */
async function seed() {
  await ingest('prompt.submitted', minutesAgo(60));
  await ingest('subagent.started', minutesAgo(45), { subagent: 'agent-a1', payload: { agent_type: 'Explore' } });
  await ingest('subagent.stopped', minutesAgo(40), { subagent: 'agent-a1', payload: { agent_type: 'Explore' } });
  await ingest('turn.ended', minutesAgo(10));
  writeTranscript('s1.jsonl', [
    reply('m1', 'claude-sonnet-5', 59, { input_tokens: 100, cache_creation_input_tokens: 900 }),
    reply('m2', 'claude-sonnet-5', 58, { input_tokens: 50, cache_read_input_tokens: 900, cache_creation_input_tokens: 100 }),
    // Nueve minutos después, con la caché de 5 min caducada, vuelve a escribir todo su contexto.
    reply('m3', 'claude-sonnet-5', 49, { input_tokens: 10, cache_creation_input_tokens: 1000 }),
  ]);
  writeTranscript('s1/subagents/agent-a1.meta.json', [{ agentType: 'Explore', description: 'Buscar' }]);
  writeTranscript('s1/subagents/agent-a1.jsonl', [reply('h1', 'claude-haiku-4-5', 44, { input_tokens: 200, cache_read_input_tokens: 800 })]);
}

const get = async <T = any>(url: string) => {
  const response = await app.inject({ method: 'GET', url });
  return { status: response.statusCode, body: response.json<T>() };
};

// Sonnet 5: entrada 2 $/M, lectura 0,2 $/M. Haiku 4.5: entrada 1 $/M, lectura 0,1 $/M.
const GROSS = (900 * 1.8 + 800 * 0.9) / 1e6;
const OVERHEAD = (2000 * 2 * 0.25) / 1e6;
const HIT_RATE = 1700 / 4060;

describe('AC-71: GET /api/v1/metrics — cache', () => {
  beforeEach(seed);

  it('da la eficiencia de la caché del periodo, con el ahorro neto y las Reescrituras', async () => {
    const { cache } = (await get(`/api/v1/metrics?since=${SINCE}`)).body;
    expect(cache.hit_rate).toBeCloseTo(HIT_RATE, 10);
    expect(cache).toMatchObject({ read_tokens: 1700, write_5m_tokens: 2000, write_1h_tokens: 0, rewrites: 1, unpriced_models: [] });
    expect(cache.savings_gross_usd).toBeCloseTo(GROSS, 6);
    expect(cache.write_overhead_usd).toBeCloseTo(OVERHEAD, 6);
    expect(cache.savings_net_usd).toBeCloseTo(GROSS - OVERHEAD, 6);
    expect(cache.rewrite_cost_usd).toBeCloseTo((1000 * 2 * 1.25) / 1e6, 6);
  });

  it('el desglose lleva su propia eficiencia y suma el total', async () => {
    const { body } = await get(`/api/v1/metrics?since=${SINCE}&breakdown=true`);
    const rows = body.breakdown.by_model as Array<{ model: string; cache: any }>;
    const sonnet = rows.find((r) => r.model === 'claude-sonnet-5')!.cache;
    const haiku = rows.find((r) => r.model === 'claude-haiku-4-5')!.cache;

    expect(sonnet).toMatchObject({ read_tokens: 900, rewrites: 1 });
    expect(sonnet.hit_rate).toBeCloseTo(900 / 3060, 10);
    expect(haiku).toMatchObject({ read_tokens: 800, rewrites: 0 });
    expect(haiku.hit_rate).toBeCloseTo(0.8, 10);
    expect(sonnet.savings_net_usd + haiku.savings_net_usd).toBeCloseTo(body.cache.savings_net_usd, 6);

    const [directory] = body.breakdown.by_directory as Array<{ cache: any }>;
    expect(directory!.cache).toStrictEqual(body.cache);
    expect(sonnet.rewrite_cost_usd + haiku.rewrite_cost_usd).toBeCloseTo(body.cache.rewrite_cost_usd, 6);
  });

  it('una Reescritura se cuenta aunque la respuesta anterior quede fuera del periodo', async () => {
    const { cache } = (await get(`/api/v1/metrics?since=${minutesAgo(55).toISOString()}`)).body;
    expect(cache.rewrites).toBe(1);
    expect(cache.read_tokens).toBe(800);
  });

  it('sin respuestas en el periodo todo es cero y la tasa es null', async () => {
    const { cache } = (await get(`/api/v1/metrics?since=${minutesAgo(1).toISOString()}`)).body;
    expect(cache).toStrictEqual({
      hit_rate: null,
      read_tokens: 0,
      write_5m_tokens: 0,
      write_1h_tokens: 0,
      savings_gross_usd: 0,
      write_overhead_usd: 0,
      savings_net_usd: 0,
      rewrites: 0,
      rewrite_cost_usd: 0,
      unpriced_models: [],
    });
  });

  it('un modelo sin Tarifa se avisa y no suma importes', async () => {
    writeTranscript('s1.jsonl', [
      reply('m1', 'claude-sonnet-5', 59, { input_tokens: 100, cache_creation_input_tokens: 900 }),
      reply('x1', 'mystery-model', 30, { input_tokens: 10, cache_read_input_tokens: 990 }),
    ]);
    const { cache } = (await get(`/api/v1/metrics?since=${SINCE}`)).body;
    expect(cache.unpriced_models).toStrictEqual(['mystery-model']);
    expect(cache.read_tokens).toBe(990 + 800);
    expect(cache.savings_gross_usd).toBeCloseTo((800 * 0.9) / 1e6, 6);
  });
});

describe('AC-72: GET /api/v1/sessions/{id} — cache', () => {
  beforeEach(seed);

  it('da la eficiencia de la Sesión y sus Subagentes y la lista de Reescrituras', async () => {
    const { body } = await get('/api/v1/sessions/s1');
    expect(body.cache.hit_rate).toBeCloseTo(HIT_RATE, 10);
    expect(body.cache.savings_net_usd).toBeCloseTo(GROSS - OVERHEAD, 6);
    expect(body.cache.rewrites).toBe(1);
    expect(body.cache_rewrites).toStrictEqual([
      {
        message_id: 'm3',
        subagent_id: null,
        occurred_at: minutesAgo(49).toISOString(),
        model: 'claude-sonnet-5',
        cause: 'expired',
        written_tokens: 1000,
        cost_usd: 0.0025,
        gap_ms: 9 * 60_000,
      },
    ]);
  });

  it('las Reescrituras de un Subagente llevan su id', async () => {
    writeTranscript('s1/subagents/agent-a1.jsonl', [
      reply('h1', 'claude-haiku-4-5', 44, { input_tokens: 200, cache_read_input_tokens: 800 }),
      reply('h2', 'claude-haiku-4-5', 43, { input_tokens: 10, cache_creation_input_tokens: 5000 }),
    ]);
    const rewrites = (await get('/api/v1/sessions/s1')).body.cache_rewrites as Array<{ message_id: string; subagent_id: string | null; cause: string }>;
    expect(rewrites.map((r) => [r.message_id, r.subagent_id, r.cause])).toStrictEqual([
      ['m3', null, 'expired'],
      ['h2', 'a1', 'other'],
    ]);
  });

  it('sin Transcript no hay eficiencia ni Reescrituras', async () => {
    rmSync(join(home, 'projects'), { recursive: true, force: true });
    const { body } = await get('/api/v1/sessions/s1');
    expect(body.cache).toBeNull();
    expect(body.cache_rewrites).toStrictEqual([]);
  });
});

describe('AC-73: caché por Lanzamiento y por Tipo de Subagente', () => {
  beforeEach(seed);

  it('cada Lanzamiento y el resumen del Tipo llevan la tasa y el ahorro neto', async () => {
    const since = new Date(0).toISOString();
    const profile = (await get(`/api/v1/agents/Explore?since=${since}`)).body;
    expect(profile.launches[0].cache_hit_rate).toBeCloseTo(0.8, 10);
    expect(profile.launches[0].cache_savings_net_usd).toBeCloseTo((800 * 0.9) / 1e6, 6);
    expect(profile.summary.cache_hit_rate).toBeCloseTo(0.8, 10);
    expect(profile.summary.cache_savings_net_usd).toBeCloseTo((800 * 0.9) / 1e6, 6);

    const row = (await get(`/api/v1/agents?since=${since}`)).body.items[0];
    expect(row).toMatchObject({ type: 'Explore', cache_hit_rate: profile.summary.cache_hit_rate });
  });

  it('sin Transcript del Subagente son null y el Tipo queda sin tasa y con ahorro 0', async () => {
    rmSync(join(home, 'projects', 'demo', 's1'), { recursive: true, force: true });
    const profile = (await get(`/api/v1/agents/Explore?since=${new Date(0).toISOString()}`)).body;
    expect(profile.launches[0]).toMatchObject({ cache_hit_rate: null, cache_savings_net_usd: null });
    expect(profile.summary).toMatchObject({ cache_hit_rate: null, cache_savings_net_usd: 0 });
  });
});
