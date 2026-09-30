import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const DAY_AGO = minutesAgo(24 * 60).toISOString();

let app: FastifyInstance;
let home: string;
let receivedAt: Date;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'mandarina-subagents-'));
  receivedAt = NOW;
  app = await buildApp({ databaseFile: ':memory:', claudeHomeMount: home, clock: { now: () => receivedAt } });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(home, { recursive: true, force: true });
});

interface Options {
  session?: string;
  project?: string;
  subagent?: string | null;
  tool?: string | null;
  payload?: Record<string, unknown>;
}

async function ingest(eventType: string, at: Date, { session = 's1', project = 'demo', subagent = null, tool = null, payload = {} }: Options = {}) {
  receivedAt = at;
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/events',
    payload: {
      schema_version: 1,
      harness: 'claude-code',
      project,
      directory: `/code/${project}`,
      session_id: session,
      subagent_id: subagent,
      event_type: eventType,
      native_event_type: 'X',
      tool_name: tool,
      occurred_at: at.toISOString(),
      transcript_path: `/home/dev/.claude/projects/demo/${session}.jsonl`,
      payload,
    },
  });
  expect(response.statusCode).toBe(202);
  receivedAt = NOW;
  return (response.json() as { id: string }).id;
}

function writeTranscript(relative: string, lines: object[]) {
  const file = join(home, 'projects', 'demo', relative);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'));
  utimesSync(file, minutesAgo(30), minutesAgo(30));
}

// Payloads reales de Claude Code, recortados.
const launch = (at: Date, toolUseId: string, type: string, description: string, options: Options = {}) =>
  ingest('tool.pre', at, {
    tool: 'Agent',
    payload: { tool_use_id: toolUseId, tool_input: { subagent_type: type, description, prompt: `Prompt de ${description}` } },
    ...options,
  });
const launchedAsync = (at: Date, toolUseId: string, agentId: string, options: Options = {}) =>
  ingest('tool.post', at, {
    tool: 'Agent',
    payload: { tool_use_id: toolUseId, tool_response: { isAsync: true, status: 'async_launched', agentId } },
    ...options,
  });
const start = (at: Date, agentId: string, type: string, options: Options = {}) =>
  ingest('subagent.started', at, { subagent: agentId, payload: { agent_id: agentId, agent_type: type }, ...options });
const stop = (at: Date, agentId: string, type: string, options: Options = {}) =>
  ingest('subagent.stopped', at, {
    subagent: agentId,
    payload: { agent_id: agentId, agent_type: type, last_assistant_message: 'Hecho' },
    ...options,
  });

const get = async <T = Record<string, unknown>>(url: string) => {
  const response = await app.inject({ method: 'GET', url });
  return { status: response.statusCode, body: response.json() as T };
};

type Item = Record<string, unknown>;

/** Una Sesión con un Subagente terminado, uno en marcha sin SubagentStart y uno interno. */
async function seed() {
  await ingest('prompt.submitted', minutesAgo(30), { payload: { prompt: 'hola' } });
  await launch(minutesAgo(29), 't1', 'Explore', 'Explorar el repo');
  await start(minutesAgo(28), 'a1', 'Explore');
  await ingest('tool.pre', minutesAgo(27), { subagent: 'a1', tool: 'Read', payload: { tool_input: { file_path: '/x' } } });
  await stop(minutesAgo(26), 'a1', 'Explore');
  await launch(minutesAgo(5), 't2', 'e2e-builder', 'generar tests del AC-28');
  await stop(minutesAgo(4), 'x1', '');
}

describe('AC-34: Eventos de Subagente', () => {
  it('cada Evento de Subagente lleva su Tipo, su tarea y, al terminar, su duración', async () => {
    await seed();
    const { body } = await get<{ items: Item[] }>('/api/v1/events?limit=50');
    const byType = (type: string) => body.items.filter((e) => e.event_type === type);

    expect(byType('subagent.started')[0]!.subagent).toStrictEqual({
      type: 'Explore',
      description: 'Explorar el repo',
      duration_ms: null,
      internal: false,
    });
    const [internal, finished] = byType('subagent.stopped');
    expect(finished!.subagent).toStrictEqual({ type: 'Explore', description: 'Explorar el repo', duration_ms: 3 * 60_000, internal: false });
    expect(internal!.subagent).toStrictEqual({ type: null, description: null, duration_ms: null, internal: true });
    expect(byType('prompt.submitted')[0]!.subagent).toBeNull();
  });

  it('el mensaje del WebSocket lleva lo mismo', async () => {
    await launch(minutesAgo(10), 't1', 'Plan', 'Planificar');
    const ws = await app.injectWS('/ws');
    const message = new Promise<string>((resolve) => ws.once('message', (d) => resolve(d.toString())));
    await start(minutesAgo(9), 'a1', 'Plan');
    const { event } = JSON.parse(await message) as { event: Item };
    ws.terminate();

    expect(event.subagent).toStrictEqual({ type: 'Plan', description: 'Planificar', duration_ms: null, internal: false });
  });

  it('el board no cuenta los internos y cuenta en marcha los lanzamientos pendientes', async () => {
    await seed();
    const { body } = await get<{ items: Item[] }>('/api/v1/sessions');

    expect(body.items[0]).toMatchObject({
      subagent_count: 2,
      running_subagents: 1,
      live_subagents: [{ subagent_id: null, agent_type: 'e2e-builder', description: 'generar tests del AC-28', current_tool: null }],
    });
  });

  it('las métricas cuentan en marcha los lanzamientos pendientes', async () => {
    await seed();
    const { body } = await get<{ subagents_running: number }>(`/api/v1/metrics?since=${DAY_AGO}`);
    expect(body.subagents_running).toBe(1);
  });

  it('el detalle marca los internos, muestra los pendientes y toma la Tarea del lanzamiento', async () => {
    await seed();
    const { body } = await get<{ subagents: Item[] }>('/api/v1/sessions/s1');

    expect(body.subagents.map((s) => [s.subagent_id, s.tool_use_id, s.agent_type, s.internal])).toStrictEqual([
      ['a1', 't1', 'Explore', false],
      [null, 't2', 'e2e-builder', false],
      ['x1', null, null, true],
    ]);
    expect(body.subagents[0]).toMatchObject({
      started_at: minutesAgo(29).toISOString(),
      stopped_at: minutesAgo(26).toISOString(),
      tool_count: 1,
      task: { description: 'Explorar el repo', prompt: 'Prompt de Explorar el repo' },
      result: 'Hecho',
    });
    expect(body.subagents[1]).toMatchObject({ stopped_at: null, task: { description: 'generar tests del AC-28' } });
  });

  it('el .meta.json del Transcript enlaza el Subagente con su lanzamiento', async () => {
    writeTranscript('s1.jsonl', []);
    writeTranscript('s1/subagents/agent-a9.meta.json', [{ agentType: 'Explore', description: 'Buscar', toolUseId: 't2' }]);
    writeTranscript('s1/subagents/agent-a9.jsonl', [{ type: 'user', message: { content: 'Busca' } }]);
    await launch(minutesAgo(10), 't1', 'Explore', 'Primero');
    await launch(minutesAgo(9), 't2', 'Explore', 'Buscar');
    await start(minutesAgo(8), 'a9', 'Explore');

    const { body } = await get<{ subagents: Item[] }>('/api/v1/sessions/s1');
    expect(body.subagents.map((s) => [s.subagent_id, s.tool_use_id])).toStrictEqual([
      [null, 't1'],
      ['a9', 't2'],
    ]);
  });
});

describe('AC-35: GET /api/v1/subagents', () => {
  it('lista los Subagentes del periodo, el más reciente primero, sin los internos', async () => {
    await seed();
    const { status, body } = await get<{ items: Item[]; stats: Item[]; facets: { projects: string[]; types: string[] } }>(
      `/api/v1/subagents?since=${DAY_AGO}`,
    );

    expect(status).toBe(200);
    expect(body.items.map((s) => [s.agent_type, s.status])).toStrictEqual([
      ['e2e-builder', 'running'],
      ['Explore', 'finished'],
    ]);
    expect(body.items[0]).toMatchObject({
      session_id: 's1',
      project: 'demo',
      subagent_id: null,
      tool_use_id: 't2',
      description: 'generar tests del AC-28',
      internal: false,
      duration_ms: 5 * 60_000,
      tokens: null,
      estimated_cost_usd: null,
    });
    expect(body.items[1]).toMatchObject({ duration_ms: 3 * 60_000, tool_count: 1, stopped_at: minutesAgo(26).toISOString() });
    expect(body.facets).toStrictEqual({ projects: ['demo'], types: ['Explore', 'e2e-builder'] });
  });

  it('lee modelo y tokens del Transcript, y ya no agrega por Tipo', async () => {
    writeTranscript('s1.jsonl', []);
    writeTranscript('s1/subagents/agent-a1.jsonl', [
      { type: 'assistant', timestamp: '2026-09-25T11:33:00.000Z', message: { id: 'm1', model: 'claude-sonnet-5', usage: { input_tokens: 1000, output_tokens: 500 } } },
    ]);
    await seed();

    const { body } = await get<{ items: Item[] } & Record<string, unknown>>(`/api/v1/subagents?since=${DAY_AGO}`);
    expect(body).not.toHaveProperty('stats');
    expect(body.items.find((s) => s.subagent_id === 'a1')).toMatchObject({ model: 'claude-sonnet-5', tokens: { input: 1000, output: 500 } });
  });

  it('AC-45: un Subagente sin fin en una Sesión Cerrada queda sin respuesta', async () => {
    await seed();
    await ingest('session.ended', minutesAgo(3));
    const { body } = await get<{ items: Item[] }>(`/api/v1/subagents?since=${DAY_AGO}`);
    expect(body.items.find((s) => s.tool_use_id === 't2')).toMatchObject({ status: 'no_response' });
  });

  it('filtra por Proyecto y Tipo sin cambiar las facetas e incluye los internos si se piden', async () => {
    await seed();
    await launch(minutesAgo(3), 't9', 'Plan', 'Planificar', { session: 's2', project: 'lucia' });

    const byType = await get<{ items: Item[]; facets: { types: string[] } }>(`/api/v1/subagents?since=${DAY_AGO}&type=Explore`);
    expect(byType.body.items.map((s) => s.agent_type)).toStrictEqual(['Explore']);
    expect(byType.body.facets.types).toStrictEqual(['Explore', 'Plan', 'e2e-builder']);

    const byProject = await get<{ items: Item[] }>(`/api/v1/subagents?since=${DAY_AGO}&project=lucia`);
    expect(byProject.body.items.map((s) => s.session_id)).toStrictEqual(['s2']);

    const withInternal = await get<{ items: Item[] }>(`/api/v1/subagents?since=${DAY_AGO}&include_internal=true`);
    expect(withInternal.body.items.filter((s) => s.internal)).toHaveLength(1);
  });

  it('solo cuenta los que empezaron en el periodo o siguen en marcha', async () => {
    await seed();
    const { body } = await get<{ items: Item[] }>(`/api/v1/subagents?since=${minutesAgo(10).toISOString()}`);
    expect(body.items.map((s) => s.tool_use_id)).toStrictEqual(['t2']);
  });

  it.each([[''], ['?since=ayer'], [`?since=${DAY_AGO}&type=`], [`?since=${DAY_AGO}&include_internal=quizá`]])(
    'responde 400 con "%s"',
    async (query) => {
      expect((await get(`/api/v1/subagents${query}`)).status).toBe(400);
    },
  );
});

describe('AC-46: GET /api/v1/agents', () => {
  const VITEST = ' Test Files  1 passed (1)\n      Tests  3 passed (3)\n   Duration  812ms\n';

  /** seed() más un segundo Explore en segundo plano que usa skills, MCP, tests y falla una herramienta. */
  async function seedAgents() {
    writeTranscript('s1.jsonl', []);
    writeTranscript('s1/subagents/agent-a3.jsonl', [
      { type: 'assistant', timestamp: '2026-09-25T11:42:00.000Z', message: { id: 'm3', model: 'claude-haiku-4-5', usage: { input_tokens: 2000, output_tokens: 800 } } },
      { type: 'assistant', timestamp: '2026-09-25T11:43:00.000Z', message: { id: 'm4', model: 'claude-haiku-4-5', content: [{ type: 'text', text: 'Revisados 3 ficheros' }], usage: { input_tokens: 10, output_tokens: 20 } } },
    ]);
    await seed();
    await ingest('tool.pre', minutesAgo(19), {
      tool: 'Agent',
      payload: { tool_use_id: 't3', tool_input: { subagent_type: 'Explore', description: 'Revisar', prompt: 'Revisa', run_in_background: true } },
    });
    await start(minutesAgo(19), 'a3', 'Explore');
    const sub = { subagent: 'a3' };
    await ingest('tool.pre', minutesAgo(18), { ...sub, tool: 'Skill', payload: { tool_use_id: 'k1', tool_input: { skill: 'tdd' } } });
    await ingest('tool.pre', minutesAgo(18), { ...sub, tool: 'mcp__playwright__browser_click', payload: { tool_use_id: 'p1', tool_input: { element: 'Guardar' } } });
    await ingest('tool.post', minutesAgo(18), { ...sub, tool: 'mcp__playwright__browser_click', payload: { tool_use_id: 'p1', error: 'Timeout' } });
    await ingest('tool.pre', minutesAgo(17), { ...sub, tool: 'Bash', payload: { tool_use_id: 'b1', tool_input: { command: 'npx vitest run' } } });
    await ingest('tool.post', minutesAgo(17), { ...sub, tool: 'Bash', payload: { tool_use_id: 'b1', tool_input: { command: 'npx vitest run' }, tool_response: { stdout: VITEST, stderr: '' } } });
    await stop(minutesAgo(15), 'a3', 'Explore');
  }

  it('compara los Tipos del periodo sin los internos', async () => {
    await seedAgents();
    const { status, body } = await get<{ items: Item[]; facets: { projects: string[] } }>(`/api/v1/agents?since=${DAY_AGO}`);

    expect(status).toBe(200);
    expect(body.items.map((t) => t.type)).toStrictEqual(['Explore', 'e2e-builder']);
    expect(body.items[0]).toMatchObject({
      launches: 2,
      running: 0,
      no_response: 0,
      foreground: 1,
      background: 1,
      duration_p50_ms: 3 * 60_000,
      duration_p95_ms: 4 * 60_000,
      tool_errors_per_launch: 0.5,
      sessions: 1,
      projects: ['demo'],
    });
    expect(body.items[1]).toMatchObject({ type: 'e2e-builder', launches: 1, running: 1 });
    expect(body.facets.projects).toStrictEqual(['demo']);
  });

  it('da el perfil de un Tipo con lo que hacen sus Lanzamientos', async () => {
    await seedAgents();
    const { body } = await get<Record<string, unknown> & { launches: Item[]; tools: Item[] }>(`/api/v1/agents/Explore?since=${DAY_AGO}`);

    expect(body.launched_by).toStrictEqual([{ launcher: null, launches: 2 }]);
    expect(body.models).toStrictEqual([{ model: 'claude-haiku-4-5', launches: 1 }]);
    expect(body.skills).toStrictEqual([{ skill: 'tdd', invocations: 1 }]);
    expect(body.mcp_servers).toStrictEqual([{ server: 'playwright', calls: 1, errors: 1 }]);
    expect(body.test_runs).toStrictEqual({ total: 1, passed: 1, failed: 0 });
    expect(body.tools).toContainEqual({ name: 'Read', calls: 1, errors: 0, blocks: 0 });
    expect(body.launches.map((l) => l.subagent_id)).toStrictEqual(['a3', 'a1']);
    expect(body.launches[0]).toMatchObject({
      description: 'Revisar',
      status: 'finished',
      background: true,
      tool_count: 3,
      tool_errors: 1,
      blocks: 0,
      result: 'Revisados 3 ficheros',
    });
  });

  it('AC-103: las skills del perfil suman las del Transcript del Subagente sin duplicar las del hook', async () => {
    await seedAgents();
    const skill = (id: string, name: string) => ({
      type: 'assistant',
      timestamp: '2026-09-25T11:43:30.000Z',
      message: { id: `m-${id}`, model: 'claude-haiku-4-5', content: [{ type: 'tool_use', id, name: 'Skill', input: { skill: name } }], usage: { input_tokens: 1, output_tokens: 1 } },
    });
    // k1 ya consta como tool.pre del hook; k2 solo está en el Transcript.
    writeTranscript('s1/subagents/agent-a3.jsonl', [skill('k1', 'tdd'), skill('k2', 'commit')]);

    const { body } = await get<Record<string, unknown>>(`/api/v1/agents/Explore?since=${DAY_AGO}`);
    expect(body.skills).toStrictEqual([
      { skill: 'tdd', invocations: 1 },
      { skill: 'commit', invocations: 1 },
    ]);
  });

  it('sin-tipo agrupa los Lanzamientos sin Tipo y un Tipo sin Lanzamientos devuelve ceros', async () => {
    await seed();
    await ingest('tool.pre', minutesAgo(2), { tool: 'Agent', payload: { tool_use_id: 't9', tool_input: { description: 'Sin tipo' } } });

    const none = await get<{ summary: Item; launches: Item[] }>(`/api/v1/agents/sin-tipo?since=${DAY_AGO}`);
    expect(none.body.summary).toMatchObject({ type: null, launches: 1 });
    expect(none.body.launches[0]).toMatchObject({ description: 'Sin tipo', status: 'running' });

    const unknown = await get<{ summary: Item; launches: Item[] }>(`/api/v1/agents/no-existe?since=${DAY_AGO}`);
    expect(unknown.status).toBe(200);
    expect(unknown.body.summary).toMatchObject({ type: 'no-existe', launches: 0 });
  });

  it('filtra por Proyecto', async () => {
    await seed();
    await launch(minutesAgo(3), 't8', 'Plan', 'Planificar', { session: 's2', project: 'lucia' });
    const { body } = await get<{ items: Item[]; facets: { projects: string[] } }>(`/api/v1/agents?since=${DAY_AGO}&project=lucia`);
    expect(body.items.map((t) => t.type)).toStrictEqual(['Plan']);
    expect(body.facets.projects).toStrictEqual(['demo', 'lucia']);
  });

  it.each([[''], ['?since=ayer'], [`?since=${DAY_AGO}&project=`], [`?since=${DAY_AGO}&tipo=x`]])('responde 400 con "%s"', async (query) => {
    expect((await get(`/api/v1/agents${query}`)).status).toBe(400);
    expect((await get(`/api/v1/agents/Explore${query}`)).status).toBe(400);
  });
});
