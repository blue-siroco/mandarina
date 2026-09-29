import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

let app: FastifyInstance;
let home: string;
let clock: Date;
let ids: Record<string, string>;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'mandarina-evaluations-'));
  clock = NOW;
  ids = {};
  app = await buildApp({ databaseFile: ':memory:', claudeHomeMount: home, clock: { now: () => clock } });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(home, { recursive: true, force: true });
});

interface Options {
  subagent?: string | null;
  tool?: string | null;
  project?: string;
  payload?: Record<string, unknown>;
  key?: string;
}

/** Ingiere un Evento y recuerda su id bajo `key`. */
async function ingest(session: string, eventType: string, at: Date, options: Options = {}) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/events',
    payload: {
      schema_version: 1,
      harness: 'claude-code',
      project: options.project ?? 'demo',
      directory: '/code/demo',
      session_id: session,
      subagent_id: options.subagent ?? null,
      event_type: eventType,
      native_event_type: 'X',
      tool_name: options.tool ?? null,
      occurred_at: at.toISOString(),
      transcript_path: `/home/dev/.claude/projects/demo/${session}.jsonl`,
      payload: options.payload ?? {},
    },
  });
  const id = response.json<{ id: string }>().id;
  if (options.key) ids[options.key] = id;
  return id;
}

function writeTranscript(relative: string, lines: object[]) {
  const file = join(home, 'projects', 'demo', relative);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'));
}

const reply = (id: string, model: string, timestamp: string) => ({
  type: 'assistant',
  timestamp,
  message: { id, model, usage: { input_tokens: 10, output_tokens: 5 } },
});

const put = (type: string, id: string, body: unknown) =>
  app.inject({ method: 'PUT', url: `/api/v1/evaluations/${type}/${encodeURIComponent(id)}`, payload: body as object });
const get = async <T = any>(url: string) => {
  const response = await app.inject({ method: 'GET', url });
  return { status: response.statusCode, body: response.json<T>() };
};
const good = { score: 1, tags: ['Bug fix'], note: 'Bien' };

/** Dos Turnos y un Subagente en la Sesión `s1`; una Sesión `s2` de otro Proyecto. */
async function seed() {
  await ingest('s1', 'prompt.submitted', minutesAgo(50), { key: 'turn1', payload: { prompt: 'arregla el test\ny después el lint' } });
  await ingest('s1', 'tool.pre', minutesAgo(49), { tool: 'Read', payload: { tool_use_id: 'r1' } });
  await ingest('s1', 'tool.pre', minutesAgo(48), { tool: 'Agent', payload: { tool_use_id: 'a1', tool_input: { subagent_type: 'Explore', description: 'buscar el test', prompt: 'busca el test que falla' } } });
  await ingest('s1', 'subagent.started', minutesAgo(47), { subagent: 'agent-a1', payload: { agent_type: 'Explore' } });
  await ingest('s1', 'tool.pre', minutesAgo(46), { subagent: 'agent-a1', tool: 'Grep', payload: { tool_use_id: 'g1' } });
  await ingest('s1', 'subagent.stopped', minutesAgo(45), { subagent: 'agent-a1', payload: { agent_type: 'Explore', last_assistant_message: 'Está en x.test.ts' } });
  await ingest('s1', 'turn.ended', minutesAgo(44), { payload: { last_assistant_message: 'Arreglado.' } });
  await ingest('s1', 'prompt.submitted', minutesAgo(30), { key: 'turn2', payload: { prompt: 'ahora la documentación' } });
  await ingest('s1', 'tool.pre', minutesAgo(29), { tool: 'Edit', payload: { tool_use_id: 'e1' } });
  await ingest('s1', 'tool.pre', minutesAgo(28), { tool: 'Read', payload: { tool_use_id: 'r2' } });
  await ingest('s1', 'turn.ended', minutesAgo(27), { payload: { last_assistant_message: 'Documentado con API_KEY=sk-secreto1234567890' } });
  await ingest('s2', 'prompt.submitted', minutesAgo(20), { project: 'lucia', key: 'turn3', payload: { prompt: 'otra cosa' } });
}

describe('AC-55: PUT y DELETE /api/v1/evaluations/{tipo}/{id}', () => {
  beforeEach(seed);

  it('guarda la Evaluación de una Sesión, de un Turno y de un Subagente con su Proyecto y su Sesión', async () => {
    const session = await put('session', 's1', good);
    expect(session.statusCode).toBe(200);
    expect(session.json()).toStrictEqual({
      object_type: 'session',
      object_id: 's1',
      session_id: 's1',
      project: 'demo',
      score: 1,
      tags: ['bug-fix'],
      note: 'Bien',
      summary: null,
      agent_type: null,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
    });

    const turn = (await put('turn', ids.turn1!, { score: -1, tags: [], note: null })).json();
    expect(turn).toMatchObject({ object_type: 'turn', object_id: ids.turn1, session_id: 's1', project: 'demo', score: -1 });

    const subagent = (await put('subagent', 'agent-a1', { score: null, tags: ['x'], note: null })).json();
    expect(subagent).toMatchObject({ object_type: 'subagent', object_id: 'agent-a1', session_id: 's1', agent_type: 'Explore' });
  });

  it('sustituir mantiene created_at y cambia updated_at', async () => {
    await put('session', 's1', good);
    clock = new Date(NOW.getTime() + 60_000);
    const again = (await put('session', 's1', { score: -1, tags: [], note: 'Mal' })).json();
    expect(again).toMatchObject({ score: -1, tags: [], note: 'Mal', created_at: NOW.toISOString(), updated_at: clock.toISOString() });
    expect((await get('/api/v1/evaluations')).body.items).toHaveLength(1);
  });

  it('responde 400 a valores inválidos y a una Evaluación vacía', async () => {
    for (const body of [{ score: 3, tags: [], note: null }, { score: null, tags: [], note: null }, { tags: [] }, { score: 1, tags: 'x', note: null }, { score: 1, tags: [], note: 'x'.repeat(2001) }]) {
      const response = await put('session', 's1', body);
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toEqual(expect.any(String));
    }
    expect((await get('/api/v1/evaluations')).body.items).toHaveLength(0);
  });

  it('responde 404 si el objeto no existe y 400 a un tipo de objeto desconocido', async () => {
    expect((await put('session', 'no-existe', good)).statusCode).toBe(404);
    expect((await put('turn', 'no-existe', good)).statusCode).toBe(404);
    expect((await put('subagent', 'no-existe', good)).statusCode).toBe(404);
    // Un Evento que existe pero no abre un Turno tampoco es un Turno.
    const tool = (await get('/api/v1/events?limit=1&event_type=tool.pre')).body.items[0].id;
    expect((await put('turn', tool, good)).statusCode).toBe(404);
    expect((await put('herramienta', 's1', good)).statusCode).toBe(400);
  });

  it('borra la Evaluación y responde 404 si no la hay', async () => {
    await put('session', 's1', good);
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/evaluations/session/s1' })).statusCode).toBe(204);
    expect((await get('/api/v1/evaluations')).body.items).toHaveLength(0);
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/evaluations/session/s1' })).statusCode).toBe(404);
  });

  it('enmascara los secretos de la Nota', async () => {
    const saved = (await put('session', 's1', { score: null, tags: [], note: 'usé GITHUB_TOKEN=ghp_abcdefghijklmnopqrstu' })).json();
    expect(saved.note).toBe('usé GITHUB_TOKEN=[REDACTED_API_KEY]');
  });
});

describe('AC-55: GET /api/v1/evaluations', () => {
  beforeEach(async () => {
    await seed();
    clock = minutesAgo(10);
    await put('session', 's1', { score: 1, tags: ['bug-fix', 'refactor'], note: 'Buena sesión' });
    clock = minutesAgo(9);
    await put('turn', ids.turn1!, { score: -1, tags: ['hallucination', 'bug-fix'], note: null });
    clock = minutesAgo(8);
    await put('subagent', 'agent-a1', { score: 1, tags: [], note: 'Lo encontró' });
    clock = minutesAgo(7);
    await put('turn', ids.turn3!, { score: null, tags: ['bug-fix'], note: 'Sin puntuar' });
    clock = NOW;
  });

  it('lista la actualizada más recientemente primero, con el resumen del objeto', async () => {
    const { body } = await get('/api/v1/evaluations');
    expect(body.items.map((e: any) => [e.object_type, e.object_id])).toStrictEqual([
      ['turn', ids.turn3],
      ['subagent', 'agent-a1'],
      ['turn', ids.turn1],
      ['session', 's1'],
    ]);
    const [otherTurn, subagent, turn, session] = body.items;
    expect(turn.summary).toBe('arregla el test');
    expect(otherTurn.summary).toBe('otra cosa');
    expect(subagent).toMatchObject({ summary: 'buscar el test', agent_type: 'Explore' });
    expect(session.summary).toBeNull();
  });

  it('cuenta las Etiquetas de lo devuelto, por uso, y ofrece los Proyectos antes de filtrar', async () => {
    const { body } = await get('/api/v1/evaluations');
    expect(body.tags).toStrictEqual([
      { tag: 'bug-fix', count: 3 },
      { tag: 'hallucination', count: 1 },
      { tag: 'refactor', count: 1 },
    ]);
    expect(body.facets.projects).toStrictEqual(['demo', 'lucia']);
    const filtered = (await get('/api/v1/evaluations?project=lucia')).body;
    expect(filtered.tags).toStrictEqual([{ tag: 'bug-fix', count: 1 }]);
    expect(filtered.facets.projects).toStrictEqual(['demo', 'lucia']);
  });

  it.each([
    ['object_type=turn', 2],
    ['object_type=turn&object_type=subagent', 3],
    ['score=up', 2],
    ['score=down', 1],
    ['score=none', 1],
    ['tag=hallucination', 1],
    ['tag=bug-fix', 3],
    ['project=lucia', 1],
    ['session_id=s1', 3],
    ['session_id=s2', 1],
    [`since=${minutesAgo(8.5).toISOString()}`, 2],
    ['object_type=turn&score=down&tag=bug-fix', 1],
  ])('filtra por %s', async (query, count) => {
    const { status, body } = await get(`/api/v1/evaluations?${query}`);
    expect(status).toBe(200);
    expect(body.items).toHaveLength(count);
  });

  it('responde 400 a filtros inválidos', async () => {
    for (const query of ['object_type=herramienta', 'score=maybe', 'since=ayer', 'project=', 'tag=']) {
      expect((await get(`/api/v1/evaluations?${query}`)).status).toBe(400);
    }
  });

  it('GET /tags devuelve todas las Etiquetas usadas, por uso y luego alfabéticamente', async () => {
    await put('turn', ids.turn3!, { score: null, tags: ['bug-fix', 'zeta', 'alfa'], note: null });
    const { body } = await get('/api/v1/evaluations/tags');
    expect(body.items).toStrictEqual([
      { tag: 'bug-fix', count: 3 },
      { tag: 'alfa', count: 1 },
      { tag: 'hallucination', count: 1 },
      { tag: 'refactor', count: 1 },
      { tag: 'zeta', count: 1 },
    ]);
  });
});

describe('AC-56: GET /api/v1/evaluations/export', () => {
  const lines = async (query = '') => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/evaluations/export${query}` });
    expect(response.headers['content-type']).toMatch(/application\/x-ndjson/);
    const text = response.body;
    return { status: response.statusCode, text, rows: text === '' ? [] : text.trimEnd().split('\n').map((l) => JSON.parse(l)) };
  };

  beforeEach(async () => {
    await seed();
    writeTranscript('s1.jsonl', [
      reply('m1', 'claude-opus-5-5', minutesAgo(46).toISOString()),
      reply('m2', 'claude-sonnet-5', minutesAgo(29).toISOString()),
    ]);
    writeTranscript('s1/subagents/agent-a1.jsonl', [reply('h1', 'claude-haiku-4-5', minutesAgo(46).toISOString())]);
    clock = minutesAgo(5);
    await put('session', 's1', { score: 1, tags: ['bug-fix'], note: 'Toda la Sesión' });
    await put('turn', ids.turn1!, { score: -1, tags: ['hallucination'], note: null });
    await put('turn', ids.turn2!, { score: 1, tags: [], note: 'Bien' });
    await put('subagent', 'agent-a1', { score: 1, tags: [], note: 'Lo encontró' });
    clock = NOW;
  });

  it('escribe una línea JSON por Evaluación, con el prompt, la respuesta, el modelo y las herramientas', async () => {
    const { status, rows } = await lines();
    expect(status).toBe(200);
    expect(rows).toHaveLength(4);
    const byId = (id: string) => rows.find((r) => r.object_id === id);

    expect(byId(ids.turn1!)).toStrictEqual({
      object_type: 'turn',
      object_id: ids.turn1,
      project: 'demo',
      session_id: 's1',
      model: 'claude-opus-5-5',
      prompt: 'arregla el test\ny después el lint',
      response: 'Arreglado.',
      tools: ['Read', 'Agent'],
      score: -1,
      tags: ['hallucination'],
      note: null,
      evaluated_at: minutesAgo(5).toISOString(),
    });
    expect(byId('agent-a1')).toMatchObject({
      object_type: 'subagent',
      prompt: 'busca el test que falla',
      response: 'Está en x.test.ts',
      model: 'claude-haiku-4-5',
      tools: ['Grep'],
    });
  });

  it('una Sesión reúne todos sus prompts, la respuesta del último Turno y el último modelo', async () => {
    const session = (await lines('?object_type=session')).rows[0];
    expect(session).toMatchObject({
      prompt: 'arregla el test\ny después el lint\n\nahora la documentación',
      model: 'claude-sonnet-5',
      tools: ['Read', 'Agent', 'Edit'],
    });
  });

  it('enmascara la respuesta como en la ingesta', async () => {
    const turn2 = (await lines()).rows.find((r) => r.object_id === ids.turn2);
    expect(turn2.response).toBe('Documentado con API_KEY=[REDACTED_API_KEY]');
  });

  it('sin Transcript el modelo es null y la respuesta de un objeto sin terminar también', async () => {
    await ingest('s3', 'prompt.submitted', minutesAgo(3), { key: 'turn4', payload: { prompt: 'sin terminar' } });
    await put('turn', ids.turn4!, { score: 1, tags: [], note: null });
    const row = (await lines()).rows.find((r) => r.object_id === ids.turn4);
    expect(row).toMatchObject({ model: null, response: null, prompt: 'sin terminar', tools: [] });
  });

  it('aplica los mismos filtros que el listado y devuelve un cuerpo vacío si no hay nada', async () => {
    expect((await lines('?tag=hallucination')).rows).toHaveLength(1);
    expect((await lines('?score=up&object_type=turn')).rows).toHaveLength(1);
    expect((await lines('?tag=no-existe')).text).toBe('');
    expect((await app.inject({ method: 'GET', url: '/api/v1/evaluations/export?score=maybe' })).statusCode).toBe(400);
  });
});

describe('AC-59: la Puntuación en las Sesiones y los agentes', () => {
  beforeEach(async () => {
    await seed();
    await put('session', 's1', { score: 1, tags: [], note: null });
    await put('turn', ids.turn3!, { score: -1, tags: [], note: null });
  });

  it('las Sesiones llevan evaluation_score, null sin Evaluación o sin puntuar', async () => {
    const list = (await get('/api/v1/sessions')).body.items as Array<{ session_id: string; evaluation_score: number | null }>;
    expect(list.find((s) => s.session_id === 's1')?.evaluation_score).toBe(1);
    // La Evaluación de un Turno de s2 no puntúa a la Sesión s2.
    expect(list.find((s) => s.session_id === 's2')?.evaluation_score).toBeNull();
    expect((await get('/api/v1/sessions/s1')).body.evaluation_score).toBe(1);
    await put('session', 's2', { score: null, tags: ['x'], note: null });
    expect((await get('/api/v1/sessions/s2')).body.evaluation_score).toBeNull();
  });

  it('el detalle da el id de cada Turno para poder evaluarlo', async () => {
    const turns = (await get('/api/v1/sessions/s1')).body.turns as Array<{ id: string; index: number }>;
    expect(turns.map((t) => [t.index, t.id])).toStrictEqual([
      [1, ids.turn1],
      [2, ids.turn2],
    ]);
  });

  it('los agentes cuentan sus Lanzamientos con Subagente bien y mal puntuado', async () => {
    const since = new Date(0).toISOString();
    const base = (await get(`/api/v1/agents?since=${since}`)).body.items.find((i: any) => i.type === 'Explore');
    expect(base).toMatchObject({ rated_up: 0, rated_down: 0 });

    await put('subagent', 'agent-a1', { score: 1, tags: [], note: null });
    const up = (await get(`/api/v1/agents?since=${since}`)).body.items.find((i: any) => i.type === 'Explore');
    expect(up).toMatchObject({ rated_up: 1, rated_down: 0 });
    expect((await get(`/api/v1/agents/Explore?since=${since}`)).body.summary).toMatchObject({ rated_up: 1, rated_down: 0 });

    await put('subagent', 'agent-a1', { score: -1, tags: [], note: null });
    const down = (await get(`/api/v1/agents?since=${since}`)).body.items.find((i: any) => i.type === 'Explore');
    expect(down).toMatchObject({ rated_up: 0, rated_down: 1 });
  });
});
