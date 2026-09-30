import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

let app: FastifyInstance;
let home: string;
let receivedAt: Date;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'mandarina-sessions-'));
  receivedAt = NOW;
  app = await buildApp({ databaseFile: ':memory:', claudeHomeMount: home, clock: { now: () => receivedAt } });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(home, { recursive: true, force: true });
});

interface Options {
  subagent?: string | null;
  tool?: string | null;
  directory?: string;
  project?: string;
  payload?: Record<string, unknown>;
  block?: { rule: string; reason: string };
}

async function ingest(session: string, eventType: string, at: Date, options: Options = {}) {
  receivedAt = at;
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/events',
    payload: {
      schema_version: 1,
      harness: 'claude-code',
      project: options.project ?? 'demo',
      directory: options.directory ?? '/code/demo',
      session_id: session,
      subagent_id: options.subagent ?? null,
      event_type: eventType,
      native_event_type: 'X',
      tool_name: options.tool ?? null,
      occurred_at: at.toISOString(),
      transcript_path: `/home/dev/.claude/projects/demo/${session}.jsonl`,
      payload: options.payload ?? {},
      ...(options.block ? { block: options.block } : {}),
    },
  });
  receivedAt = NOW;
  return response;
}

function writeTranscript(relative: string, lines: object[], mtime = minutesAgo(10)) {
  const file = join(home, 'projects', 'demo', relative);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'));
  // El reloj del test está fijo: un mtime real contaría como actividad futura.
  utimesSync(file, mtime, mtime);
}

const reply = (id: string, model: string, usage: object, timestamp = '2026-09-25T11:50:00.000Z') => ({
  type: 'assistant',
  timestamp,
  message: { id, model, usage },
});

const get = async <T = Record<string, unknown>>(url: string) => {
  const response = await app.inject({ method: 'GET', url });
  return { status: response.statusCode, body: response.json<T>() };
};

type SessionItem = Record<string, unknown> & { session_id: string; state: string };

describe('AC-15: GET /api/v1/sessions', () => {
  beforeEach(async () => {
    await ingest('working', 'prompt.submitted', minutesAgo(3));
    await ingest('working', 'tool.pre', minutesAgo(2), { tool: 'Bash', payload: { tool_input: { command: 'npm test' } } });
    await ingest('idle', 'prompt.submitted', minutesAgo(20), { directory: '/code/demo/frontend' });
    await ingest('idle', 'turn.ended', minutesAgo(10), { directory: '/code/demo/frontend' });
    await ingest('orphan', 'tool.pre', minutesAgo(90), { project: 'lucia', directory: '/code/lucia' });
    await ingest('closed', 'session.ended', minutesAgo(1));
    await ingest('old', 'session.started', new Date('2026-09-20T10:00:00.000Z'));
  });

  it('devuelve las Sesiones por inicio, la más nueva primero, con su Estado y resumen', async () => {
    const { status, body } = await get<{ items: SessionItem[] }>('/api/v1/sessions');
    expect(status).toBe(200);
    expect(body.items.map((s) => [s.session_id, s.state])).toStrictEqual([
      ['closed', 'closed'],
      ['working', 'active'],
      ['idle', 'idle'],
      ['orphan', 'orphaned'],
      ['old', 'orphaned'],
    ]);
    expect(body.items.find((s) => s.session_id === 'working')).toMatchObject({
      activity: 'working',
      current_tool: { name: 'Bash', summary: 'npm test' },
      turn_count: 1,
      tool_count: 1,
      active_duration_ms: 60_000,
      clock_duration_ms: 60_000,
      model: null,
      live_subagents: [],
    });
    expect(body.items[0]?.sparkline).toHaveLength(12);
  });

  it('una Sesión Cerrada que se retoma con el mismo session_id vuelve a estar Activa en el board y en el detalle', async () => {
    // `claude --resume` reutiliza el session_id tras un session.ended, p. ej. al volver de una parada por falta de tokens.
    const state = async () => (await get<{ items: SessionItem[] }>('/api/v1/sessions')).body.items.find((s) => s.session_id === 'closed');
    expect(await state()).toMatchObject({ state: 'closed', activity: null });

    await ingest('closed', 'session.started', minutesAgo(0));
    await ingest('closed', 'prompt.submitted', minutesAgo(0));
    expect(await state()).toMatchObject({ state: 'active', activity: 'working', turn_count: 1 });
    expect((await get<SessionItem>('/api/v1/sessions/closed')).body).toMatchObject({ state: 'active', activity: 'working' });

    await ingest('closed', 'session.ended', minutesAgo(0));
    expect(await state()).toMatchObject({ state: 'closed' });
  });

  it('un Evento nuevo no cambia el orden', async () => {
    await ingest('old', 'tool.pre', minutesAgo(0));
    const { body } = await get<{ items: SessionItem[] }>('/api/v1/sessions');
    expect(body.items.at(-1)?.session_id).toBe('old');
  });

  it('lista los Subagentes en marcha con su Tarea y su herramienta en curso', async () => {
    await ingest('sub', 'prompt.submitted', minutesAgo(4));
    await ingest('sub', 'subagent.started', minutesAgo(3), { subagent: 'agent-77', payload: { agent_type: 'Explore' } });
    await ingest('sub', 'tool.pre', minutesAgo(2), {
      subagent: 'agent-77',
      tool: 'Grep',
      payload: { tool_input: { pattern: 'TODO' } },
    });
    writeTranscript('sub.jsonl', []);
    writeTranscript('sub/subagents/agent-77.meta.json', [{ agentType: 'Explore', description: 'Buscar plugins' }]);
    writeTranscript('sub/subagents/agent-77.jsonl', [{ type: 'user', message: { content: 'Busca plugins' } }]);

    const { body } = await get<{ items: SessionItem[] }>('/api/v1/sessions');
    expect(body.items.find((s) => s.session_id === 'sub')?.live_subagents).toStrictEqual([
      {
        subagent_id: 'agent-77',
        agent_type: 'Explore',
        description: 'Buscar plugins',
        current_tool: { name: 'Grep', summary: 'TODO' },
      },
    ]);
  });

  it('filtra por since, Estado, Directorio y Proyecto, y devuelve las facetas antes de filtrar', async () => {
    const since = minutesAgo(60).toISOString();
    const recent = await get<{ items: SessionItem[]; facets: unknown }>(`/api/v1/sessions?since=${since}`);
    expect(recent.body.items.map((s) => s.session_id).sort()).toStrictEqual(['closed', 'idle', 'working']);

    const filtered = await get<{ items: SessionItem[]; facets: unknown }>(
      `/api/v1/sessions?state=active&state=idle&directory=${encodeURIComponent('/code/demo/frontend')}`,
    );
    expect(filtered.body.items.map((s) => s.session_id)).toStrictEqual(['idle']);
    expect(filtered.body.facets).toStrictEqual({
      projects: ['demo', 'lucia'],
      directories: ['/code/demo', '/code/demo/frontend', '/code/lucia'],
    });

    const byProject = await get<{ items: SessionItem[] }>('/api/v1/sessions?project=lucia');
    expect(byProject.body.items.map((s) => s.session_id)).toStrictEqual(['orphan']);
  });

  it.each(['?state=zombie', '?since=ayer', '?extra=1'])('%s → 400', async (query) => {
    expect((await get(`/api/v1/sessions${query}`)).status).toBe(400);
  });
});

describe('AC-18: GET /api/v1/sessions/:id', () => {
  it('devuelve Turnos, herramientas, Subagentes, contexto, tokens y Bloqueos', async () => {
    await ingest('s1', 'session.started', minutesAgo(30));
    await ingest('s1', 'prompt.submitted', minutesAgo(20), { payload: { prompt: 'Añade un test' } });
    await ingest('s1', 'tool.pre', minutesAgo(19), { tool: 'Read' });
    await ingest('s1', 'tool.pre', minutesAgo(18), { tool: 'Bash' });
    await ingest('s1', 'tool.pre', minutesAgo(17), { tool: 'Read' });
    await ingest('s1', 'subagent.started', minutesAgo(16), { subagent: 'agent-9a8b', payload: { agent_type: 'Explore' } });
    await ingest('s1', 'tool.pre', minutesAgo(15), {
      subagent: 'agent-9a8b',
      tool: 'Grep',
      payload: { tool_use_id: 'g1', tool_input: { pattern: 'observe' } },
    });
    await ingest('s1', 'tool.post', minutesAgo(14.5), { subagent: 'agent-9a8b', tool: 'Grep', payload: { tool_use_id: 'g1' } });
    await ingest('s1', 'subagent.stopped', minutesAgo(14), { subagent: 'agent-9a8b' });
    await ingest('s1', 'tool.blocked', minutesAgo(13), {
      tool: 'Bash',
      payload: { tool_input: { command: 'rm -rf /' } },
      block: { rule: 'dangerous-rm', reason: 'Borrado recursivo fuera del Directorio' },
    });
    await ingest('s1', 'turn.ended', minutesAgo(10));
    writeTranscript('s1.jsonl', [
      reply('m1', 'claude-opus-5-5', { input_tokens: 10, cache_read_input_tokens: 1000, output_tokens: 50 }, '2026-09-25T11:40:00.000Z'),
      reply('m2', 'claude-opus-5-5', { input_tokens: 20, cache_read_input_tokens: 5000, output_tokens: 80 }),
    ]);
    writeTranscript('s1/subagents/agent-9a8b.jsonl', [
      { type: 'user', message: { content: 'Busca los plugins de observabilidad' } },
      reply('m3', 'claude-haiku-4-5', { input_tokens: 5, output_tokens: 7 }),
      { type: 'assistant', timestamp: '2026-09-25T11:46:00.000Z', message: { content: [{ type: 'text', text: 'Hay 3 plugins.' }] } },
    ]);
    writeTranscript('s1/subagents/agent-9a8b.meta.json', [{ agentType: 'Explore', description: 'Buscar plugins' }]);

    const { status, body } = await get<Record<string, unknown>>('/api/v1/sessions/s1');

    expect(status).toBe(200);
    expect(body).toMatchObject({
      session_id: 's1',
      state: 'idle',
      activity: 'paused',
      model: 'claude-opus-5-5',
      transcript_available: true,
      context: { model: 'claude-opus-5-5', used: 5020, limit: 1_000_000 },
      tools: [
        { name: 'Read', count: 2 },
        { name: 'Bash', count: 1 },
        { name: 'Grep', count: 1 },
      ],
      turns: [{ index: 1, prompt: 'Añade un test', tool_count: 5, duration_ms: 10 * 60_000, ended_at: minutesAgo(10).toISOString() }],
      subagents: [
        {
          subagent_id: 'agent-9a8b',
          agent_type: 'Explore',
          duration_ms: 2 * 60_000,
          tool_count: 1,
          model: 'claude-haiku-4-5',
          tokens: { input: 5, output: 7, cache_read: 0, cache_creation: 0 },
          task: { description: 'Buscar plugins', prompt: 'Busca los plugins de observabilidad' },
          tools: [{ name: 'Grep', summary: 'observe', started_at: minutesAgo(15).toISOString(), status: 'ok' }],
          result: 'Hay 3 plugins.',
          status: 'finished', // AC-126
        },
      ],
      blocks: [
        { tool_name: 'Bash', summary: 'rm -rf /', rule: 'dangerous-rm', reason: 'Borrado recursivo fuera del Directorio' },
      ],
      block_count: 1,
    });
    expect(body.usage).toMatchObject({
      tokens: { input: 35, output: 137, cache_read: 6000, cache_creation: 0 },
      requests: 3,
      models: ['claude-opus-5-5', 'claude-haiku-4-5'],
    });
    // Opus 5.5: 30×4 + 130×20 + 6000×0,2; Haiku: 5×1 + 7×5 (por millón)
    expect((body.usage as { estimated_cost_usd: number }).estimated_cost_usd).toBeCloseTo(0.00396, 8);
  });

  it('sin Transcript el resto del detalle funciona', async () => {
    await ingest('bare', 'prompt.submitted', minutesAgo(2));
    const { body } = await get('/api/v1/sessions/bare');
    expect(body).toMatchObject({ transcript_available: false, usage: null, context: null, model: null, turns: [{ index: 1 }] });
  });

  it('una Sesión inexistente → 404', async () => {
    expect((await get('/api/v1/sessions/nope')).status).toBe(404);
  });
});

describe('AC-17: filtros de GET /api/v1/events', () => {
  it('filtra por Sesión, Tipos de evento y since', async () => {
    await ingest('a', 'prompt.submitted', minutesAgo(10));
    await ingest('a', 'tool.pre', minutesAgo(5), { tool: 'Bash' });
    await ingest('b', 'tool.pre', minutesAgo(4), { tool: 'Read' });
    await ingest('a', 'turn.ended', minutesAgo(1));

    type List = { items: Array<{ session_id: string; event_type: string }> };
    const bySession = await get<List>('/api/v1/events?session_id=a');
    expect(bySession.body.items.map((e) => e.event_type)).toStrictEqual(['turn.ended', 'tool.pre', 'prompt.submitted']);

    const byTypes = await get<List>('/api/v1/events?event_type=tool.pre&event_type=turn.ended');
    expect(byTypes.body.items.map((e) => `${e.session_id}:${e.event_type}`)).toStrictEqual([
      'a:turn.ended',
      'b:tool.pre',
      'a:tool.pre',
    ]);

    const since = await get<List>(`/api/v1/events?since=${minutesAgo(4.5).toISOString()}&event_type=tool.pre`);
    expect(since.body.items.map((e) => e.session_id)).toStrictEqual(['b']);

    expect((await get('/api/v1/events?event_type=nope')).status).toBe(400);
  });
});

describe('AC-21: ingesta y consulta de Bloqueos', () => {
  const block = { rule: 'secret-in-command', reason: 'El comando lleva un secreto en claro' };

  it('persiste, enmascara y difunde el Bloqueo; los demás Eventos llevan block null', async () => {
    const ws = await app.injectWS('/ws');
    const message = new Promise<{ event: Record<string, unknown> }>((resolve) =>
      ws.once('message', (d) => resolve(JSON.parse(d.toString()))),
    );
    const secret = 'sk-ant-api03-abcdefghijklmnop';
    const response = await ingest('s', 'tool.blocked', NOW, {
      tool: 'Bash',
      payload: { tool_input: { command: `curl -H "x-api-key: ${secret}"` } },
      block,
    });
    expect(response.statusCode).toBe(202);

    const live = await message;
    expect(live.event).toMatchObject({ event_type: 'tool.blocked', block });
    expect(JSON.stringify(live)).not.toContain(secret);
    ws.terminate();

    await ingest('s', 'tool.pre', NOW);
    const { body } = await get<{ items: Array<{ event_type: string; block: unknown }> }>(
      '/api/v1/events?event_type=tool.blocked&event_type=tool.pre',
    );
    expect(body.items.map((e) => [e.event_type, e.block])).toStrictEqual([
      ['tool.pre', null],
      ['tool.blocked', block],
    ]);
  });

  it.each([
    ['sin reason', { rule: 'x' }],
    ['con rule vacía', { rule: '', reason: 'y' }],
    ['con campos de más', { rule: 'x', reason: 'y', extra: 1 }],
  ])('un block %s → 400', async (_name, badBlock) => {
    const response = await ingest('s', 'tool.blocked', NOW, { block: badBlock as never });
    expect(response.statusCode).toBe(400);
  });

  it('una base de datos anterior a la rebanada 4 se migra sola', async () => {
    const file = join(home, 'old.sqlite');
    const legacy = new Database(file);
    legacy.exec(`CREATE TABLE events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, schema_version INTEGER NOT NULL,
      harness TEXT NOT NULL, project TEXT NOT NULL, directory TEXT NOT NULL, session_id TEXT NOT NULL,
      subagent_id TEXT, event_type TEXT NOT NULL, native_event_type TEXT NOT NULL, tool_name TEXT,
      occurred_at TEXT NOT NULL, received_at TEXT NOT NULL, transcript_path TEXT, payload TEXT NOT NULL)`);
    legacy
      .prepare(
        `INSERT INTO events (id, schema_version, harness, project, directory, session_id, event_type, native_event_type, occurred_at, received_at, payload)
         VALUES ('old-1', 1, 'claude-code', 'demo', '/code', 's', 'tool.pre', 'PreToolUse', ?, ?, '{}')`,
      )
      .run(NOW.toISOString(), NOW.toISOString());
    legacy.close();

    const migrated = await buildApp({ databaseFile: file });
    const response = await migrated.inject({ method: 'GET', url: '/api/v1/events' });
    expect(response.json<{ items: Array<{ id: string; block: unknown }> }>().items).toMatchObject([
      { id: 'old-1', block: null },
    ]);
    await migrated.close();
  });
});
