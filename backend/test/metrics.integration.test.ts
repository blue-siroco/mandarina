import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { toMountedPath } from '../src/infrastructure/fs-transcript-reader.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const TODAY = '2026-09-25T00:00:00.000Z';

let app: FastifyInstance;
let home: string;
let receivedAt: Date;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'mandarina-claude-'));
  receivedAt = NOW;
  // El reloj fija `received_at` de cada Evento y el "ahora" de las métricas.
  app = await buildApp({ databaseFile: ':memory:', claudeHomeMount: home, clock: { now: () => receivedAt } });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(home, { recursive: true, force: true });
});

const hostTranscript = (session: string) => `C:\\Users\\dev\\.claude\\projects\\demo\\${session}.jsonl`;

async function ingest(session: string, eventType: string, overrides: Record<string, unknown> = {}, at = NOW) {
  receivedAt = at;
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/events',
    payload: {
      schema_version: 1,
      harness: 'claude-code',
      project: 'demo',
      directory: 'C:\\Codev\\demo',
      session_id: session,
      subagent_id: null,
      event_type: eventType,
      native_event_type: 'X',
      tool_name: null,
      occurred_at: at.toISOString(),
      transcript_path: hostTranscript(session),
      payload: {},
      ...overrides,
    },
  });
  expect(response.statusCode).toBe(202);
  receivedAt = NOW;
}

function writeTranscript(relative: string, lines: object[]) {
  const file = join(home, 'projects', 'demo', relative);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'));
}

const reply = (id: string, model: string, usage: object, timestamp = '2026-09-25T10:00:00.000Z') => ({
  type: 'assistant',
  timestamp,
  message: { id, model, usage },
});

const metrics = async (query = `?since=${TODAY}`) => app.inject({ method: 'GET', url: `/api/v1/metrics${query}` });

describe('AC-11: GET /api/v1/metrics — actividad', () => {
  it('clasifica las Sesiones del día y cuenta los Subagentes en marcha', async () => {
    const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
    await ingest('working', 'prompt.submitted', {}, minutesAgo(3));
    await ingest('working', 'subagent.started', { subagent_id: 'a1' }, minutesAgo(2));
    await ingest('working', 'subagent.started', { subagent_id: 'a2' }, minutesAgo(2));
    await ingest('working', 'subagent.stopped', { subagent_id: 'a2' }, minutesAgo(1));
    await ingest('working', 'tool.pre', { tool_name: 'Bash' }, minutesAgo(1));
    await ingest('paused', 'turn.ended', {}, minutesAgo(10));
    await ingest('orphan', 'tool.pre', { tool_name: 'Read', subagent_id: 'a3' }, minutesAgo(45));
    await ingest('closed', 'session.ended', {}, minutesAgo(5));
    await ingest('yesterday', 'tool.pre', {}, new Date('2026-09-24T23:00:00.000Z'));

    const response = await metrics();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      since: TODAY,
      generated_at: NOW.toISOString(),
      sessions: { total: 4, working: 1, paused: 1, orphaned: 1, closed: 1 },
      subagents_running: 1,
      activity: { events: 8, tool_calls: 2, prompts: 1 },
    });
  });

  it.each(['', '?since=ayer', `?since=${TODAY}&extra=1`])('%s → 400', async (query) => {
    expect((await metrics(query)).statusCode).toBe(400);
  });
});

describe('AC-12: GET /api/v1/metrics — Uso de tokens y Coste estimado', () => {
  it('suma los Transcripts de la Sesión y de sus Subagentes con la Tarifa de cada modelo', async () => {
    await ingest('s1', 'tool.pre');
    writeTranscript('s1.jsonl', [
      reply('m1', 'claude-opus-5-5', { input_tokens: 1000, output_tokens: 10 }),
      reply('m1', 'claude-opus-5-5', { input_tokens: 1000, output_tokens: 500 }),
      reply('old', 'claude-opus-5-5', { output_tokens: 99999 }, '2026-09-24T22:00:00.000Z'),
    ]);
    writeTranscript('s1/subagents/agent-1.jsonl', [
      reply('m2', 'claude-haiku-4-5-20251001', { input_tokens: 200, cache_read_input_tokens: 800 }),
      reply('m3', 'mystery-model', { output_tokens: 7 }),
    ]);

    const body = (await metrics()).json();

    expect(body.tokens).toEqual({ input: 1200, output: 507, cache_read: 800, cache_creation: 0 });
    // Opus 5.5: 1000×4 + 500×20; Haiku 4.5: 200×1 + 800×0,1 (por millón)
    expect(body.estimated_cost_usd).toBeCloseTo(0.01428, 8);
    expect(body.unpriced_models).toEqual(['mystery-model']);
    expect(body.by_model.map((m: { model: string }) => m.model)).toEqual([
      'claude-opus-5-5',
      'claude-haiku-4-5-20251001',
      'mystery-model',
    ]);
    expect(body.transcripts).toEqual({ read: 1, unavailable: 0 });
  });

  it('un Transcript que no existe no hace fallar la respuesta', async () => {
    await ingest('missing', 'tool.pre');
    const response = await metrics();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      tokens: { input: 0, output: 0, cache_read: 0, cache_creation: 0 },
      estimated_cost_usd: 0,
      transcripts: { read: 0, unavailable: 1 },
    });
  });
});

describe('AC-12: toMountedPath (ADR-0003)', () => {
  it('traduce una ruta de Windows del host al volumen', () => {
    expect(toMountedPath('C:\\Users\\dev\\.claude\\projects\\p\\s.jsonl', '/claude-home')).toBe(
      '/claude-home/projects/p/s.jsonl',
    );
  });

  it('traduce una ruta POSIX del host al volumen', () => {
    expect(toMountedPath('/home/dev/.claude/projects/p/s.jsonl', '/claude-home')).toBe('/claude-home/projects/p/s.jsonl');
  });

  it('sin volumen, o fuera de ~/.claude, deja la ruta tal cual', () => {
    expect(toMountedPath('/tmp/s.jsonl', undefined)).toBe('/tmp/s.jsonl');
    expect(toMountedPath('/tmp/s.jsonl', '/claude-home')).toBe('/tmp/s.jsonl');
  });
});

describe('AC-38: GET /api/v1/metrics — Directorio y desglose', () => {
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
  const at = (m: number) => minutesAgo(m).toISOString();
  const OTHER = 'C:\\Codev\\lucia';

  /** s1 en demo: Sonnet y después Opus, con un Subagente Haiku en marcha. s2 en lucia, en pausa y sin Transcript. */
  async function seed() {
    writeTranscript('s1.jsonl', [
      reply('m1', 'claude-sonnet-5', { input_tokens: 100, output_tokens: 1000 }, at(60)),
      reply('m2', 'claude-opus-5-5', { input_tokens: 200, output_tokens: 2000, cache_read_input_tokens: 800 }, at(10)),
    ]);
    writeTranscript('s1/subagents/agent-a1.jsonl', [reply('h1', 'claude-haiku-4-5', { input_tokens: 50, output_tokens: 500 }, at(5))]);
    await ingest('s1', 'prompt.submitted', { payload: { prompt: 'hola' } }, minutesAgo(61));
    await ingest('s1', 'tool.pre', { tool_name: 'Read' }, minutesAgo(30));
    await ingest('s1', 'subagent.started', { subagent_id: 'agent-a1', payload: { agent_type: 'Explore' } }, minutesAgo(6));
    await ingest('s1', 'tool.pre', { tool_name: 'Grep', subagent_id: 'agent-a1' }, minutesAgo(4));
    await ingest('s1', 'tool.blocked', { tool_name: 'Bash', block: { rule: 'dangerous-rm', reason: 'rm' } }, minutesAgo(2));
    await ingest('s2', 'prompt.submitted', { directory: OTHER, project: 'lucia', transcript_path: null }, minutesAgo(9));
    await ingest('s2', 'turn.ended', { directory: OTHER, project: 'lucia', transcript_path: null }, minutesAgo(8));
  }

  type Row = Record<string, unknown> & {
    sessions: { working: number; paused: number; orphaned: number };
    activity: { tool_calls: number; prompts: number; blocks: number };
    tokens: { input: number; output: number; cache_read: number };
  };
  const get = async (query: string) => {
    const response = await metrics(query);
    return { status: response.statusCode, body: response.json() as Row & { breakdown: { by_directory: Row[]; by_model: Row[] } | null } };
  };

  it('sin breakdown no desglosa', async () => {
    await seed();
    expect((await get(`?since=${TODAY}`)).body.breakdown).toBeNull();
  });

  it('con directory, las fichas son solo de ese Directorio', async () => {
    await seed();
    const { body } = await get(`?since=${TODAY}&directory=${encodeURIComponent(OTHER)}`);
    expect(body.sessions).toMatchObject({ total: 1, paused: 1, working: 0 });
    expect(body.activity).toMatchObject({ prompts: 1, tool_calls: 0 });
    expect(body.tokens.output).toBe(0);
    expect(body.transcripts).toStrictEqual({ read: 0, unavailable: 0 });
  });

  it('desglosa por Directorio con las mismas cifras que el total', async () => {
    await seed();
    const { body } = await get(`?since=${TODAY}&breakdown=true`);
    const demo = body.breakdown!.by_directory.find((d) => d.directory === 'C:\\Codev\\demo')!;
    const lucia = body.breakdown!.by_directory.find((d) => d.directory === OTHER)!;

    expect(body.breakdown!.by_directory).toHaveLength(2);
    expect(demo).toMatchObject({
      project: 'demo',
      sessions: { working: 1, paused: 0, orphaned: 0 },
      subagents_running: 1,
      activity: { tool_calls: 2, prompts: 1, blocks: 1 },
      main_model: 'claude-opus-5-5',
      transcripts_unavailable: 0,
    });
    expect(demo.tokens).toMatchObject({ input: 350, output: 3500, cache_read: 800 });
    expect(lucia).toMatchObject({ project: 'lucia', sessions: { paused: 1 }, main_model: null, estimated_cost_usd: 0 });
    expect(Number(demo.estimated_cost_usd) + Number(lucia.estimated_cost_usd)).toBeCloseTo(Number(body.estimated_cost_usd), 6);
  });

  it('desglosa por modelo con el modelo en uso en cada momento', async () => {
    await seed();
    const { body } = await get(`?since=${TODAY}&breakdown=true`);
    const byModel = new Map(body.breakdown!.by_model.map((m) => [m.model as string | null, m]));

    expect([...byModel.keys()].sort()).toStrictEqual(['claude-haiku-4-5', 'claude-opus-5-5', 'claude-sonnet-5', null].sort());
    expect(byModel.get('claude-opus-5-5')).toMatchObject({ sessions: { working: 1 }, activity: { tool_calls: 0, prompts: 0, blocks: 1 } });
    expect(byModel.get('claude-sonnet-5')).toMatchObject({ activity: { tool_calls: 1, prompts: 1, blocks: 0 } });
    expect(byModel.get('claude-haiku-4-5')).toMatchObject({ subagents_running: 1, activity: { tool_calls: 1 } });
    expect(byModel.get(null)).toMatchObject({ sessions: { paused: 1 }, activity: { prompts: 1 }, rate: null, cost_breakdown: null });
    expect(byModel.get('claude-opus-5-5')!.rate).toStrictEqual({ input: 4, output: 20, cache_read: 0.2, cache_write_5m: 5, cache_write_1h: 8 });
    expect(byModel.get('claude-opus-5-5')!.cost_breakdown).toMatchObject({ output: 0.04 });

    const sum = (pick: (m: Row) => number) => body.breakdown!.by_model.reduce((n, m) => n + pick(m), 0);
    expect(sum((m) => m.activity.tool_calls)).toBe(body.activity.tool_calls);
    expect(sum((m) => m.activity.prompts)).toBe(body.activity.prompts);
    expect(sum((m) => m.sessions.working + m.sessions.paused)).toBe(body.sessions.working + body.sessions.paused);
    expect(sum((m) => m.tokens.output)).toBe(body.tokens.output);
  });

  it.each([[`?since=${TODAY}&directory=`], [`?since=${TODAY}&breakdown=quizá`]])('responde 400 con "%s"', async (query) => {
    expect((await get(query)).status).toBe(400);
  });
});
