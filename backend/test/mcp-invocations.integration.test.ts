import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const WEEK_AGO = '2026-09-18T12:00:00.000Z';
const minutesAgo = (m: number, s = 0) => new Date(NOW.getTime() - m * 60_000 + s * 1000);

let app: FastifyInstance;
let receivedAt: Date;

beforeEach(async () => {
  receivedAt = NOW;
  app = await buildApp({ databaseFile: ':memory:', clock: { now: () => receivedAt } });
  await app.ready();
});

afterEach(async () => app.close());

interface Input {
  session?: string;
  project?: string;
  subagent?: string | null;
  tool?: string | null;
  native?: string;
  payload?: Record<string, unknown>;
}

async function ingest(eventType: string, at: Date, { session = 's1', project = 'demo', subagent = null, tool = null, native = 'X', payload = {} }: Input = {}) {
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
      native_event_type: native,
      tool_name: tool,
      occurred_at: at.toISOString(),
      transcript_path: null,
      payload,
    },
  });
  expect(response.statusCode).toBe(202);
  receivedAt = NOW;
  return (response.json() as { id: string }).id;
}

const NAVIGATE = 'mcp__playwright__browser_navigate';
const SCREENSHOT = 'mcp__playwright__browser_take_screenshot';
const IMAGE = [{ type: 'text', text: 'Captura' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBOR'.repeat(2000) } }];

const pre = (at: Date, tool: string, id: string, extra: Input = {}) =>
  ingest('tool.pre', at, {
    tool,
    native: 'PreToolUse',
    payload: { tool_name: tool, tool_input: { url: 'http://localhost:4200' }, tool_use_id: id, mcp_server: { name: 'playwright', source: 'project' } },
    ...extra,
  });
const post = (at: Date, tool: string, id: string, response: unknown, extra: Input = {}) =>
  ingest('tool.post', at, { tool, native: 'PostToolUse', payload: { tool_name: tool, tool_use_id: id, tool_response: response, duration_ms: 850 }, ...extra });
const failure = (at: Date, tool: string, id: string, error: string, isInterrupt = false) =>
  ingest('tool.post', at, { tool, native: 'PostToolUseFailure', payload: { tool_name: tool, tool_use_id: id, error, is_interrupt: isInterrupt } });

async function list(query = `?since=${WEEK_AGO}`) {
  const response = await app.inject({ method: 'GET', url: `/api/v1/mcp-invocations${query}` });
  return {
    status: response.statusCode,
    body: response.json() as {
      items: Array<Record<string, unknown>>;
      servers: Array<Record<string, unknown> & { tools: Array<Record<string, unknown>> }>;
      unused_deferred: Array<Record<string, unknown>>;
      facets: { projects: string[]; servers: string[] };
    },
  };
}

/** Una Sesión con navegación correcta, captura con imagen, un fallo, una interrupción y una sin respuesta. */
async function seed() {
  await ingest('prompt.submitted', minutesAgo(30), { payload: { prompt: 'prueba la UI' } });
  await ingest('tool.post', minutesAgo(29), {
    tool: 'ToolSearch',
    payload: { tool_response: { matches: [NAVIGATE, SCREENSHOT, 'mcp__playwright__browser_resize'], query: 'select:…' } },
  });
  await pre(minutesAgo(28), NAVIGATE, 't1');
  await post(minutesAgo(28, 1), NAVIGATE, 't1', [{ type: 'text', text: '### Page\n- Page URL: http://localhost:4200' }]);
  await pre(minutesAgo(27), SCREENSHOT, 't2');
  await post(minutesAgo(27, 2), SCREENSHOT, 't2', IMAGE);
  await pre(minutesAgo(26), NAVIGATE, 't3');
  await failure(minutesAgo(26, 5), NAVIGATE, 't3', 'net::ERR_CONNECTION_REFUSED\n    at …');
  await pre(minutesAgo(25), NAVIGATE, 't4');
  await failure(minutesAgo(25, 1), NAVIGATE, 't4', 'Interrupted by user', true);
  await pre(minutesAgo(24), SCREENSHOT, 't5');
  await ingest('turn.ended', minutesAgo(20));
}

describe('AC-42: GET /api/v1/mcp-invocations', () => {
  it('devuelve las invocaciones con estado, latencia y tamaño, la más reciente primero', async () => {
    await seed();
    const { status, body } = await list();

    expect(status).toBe(200);
    expect(body.items.map((i) => i.status)).toStrictEqual(['no_response', 'interrupted', 'error', 'ok', 'ok']);
    expect(body.items[2]).toMatchObject({ error: 'net::ERR_CONNECTION_REFUSED', duration_ms: 5000 });
    expect(body.items[3]).toMatchObject({ tool: 'browser_take_screenshot', has_image: true, duration_ms: 850, scope: 'project', server: 'playwright' });
    expect(body.items[3]!.response_bytes).toBe(Buffer.byteLength(JSON.stringify(IMAGE)));
    expect(body.items[4]).toMatchObject({ tool: 'browser_navigate', summary: 'http://localhost:4200', has_image: false, subagent_id: null });
  });

  it('agrega por servidor y herramienta', async () => {
    await seed();
    const { body } = await list();
    const [server] = body.servers;

    expect(body.servers).toHaveLength(1);
    expect(server).toMatchObject({
      server: 'playwright',
      scopes: ['project'],
      projects: ['demo'],
      calls: 5,
      ok: 2,
      errors: 1,
      interrupted: 1,
      no_response: 1,
      has_image: true,
      sessions: 1,
    });
    expect(server!.failure_rate).toBeCloseTo(1 / 3, 6);
    expect(server!.tools.map((t) => [t.tool, t.calls])).toStrictEqual([
      ['browser_navigate', 3],
      ['browser_take_screenshot', 2],
    ]);
  });

  it('lista las herramientas cargadas con ToolSearch y sin usar', async () => {
    await seed();
    const { body } = await list();
    expect(body.unused_deferred).toStrictEqual([
      { session_id: 's1', tool_name: 'mcp__playwright__browser_resize', server: 'playwright', tool: 'browser_resize', loaded_at: minutesAgo(29).toISOString() },
    ]);
  });

  it('filtra por Proyecto, servidor y Sesión sin cambiar las facetas', async () => {
    await seed();
    await pre(minutesAgo(10), 'mcp__claude_ai_Claude_Docs__batch', 'd1', { session: 's2', project: 'lucia', payload: { tool_input: { batch: [] }, tool_use_id: 'd1' } });

    const byServer = await list(`?since=${WEEK_AGO}&server=claude_ai_Claude_Docs`);
    expect(byServer.body.items.map((i) => i.session_id)).toStrictEqual(['s2']);
    expect(byServer.body.items[0]).toMatchObject({ scope: null, tool: 'batch' });
    expect(byServer.body.facets).toStrictEqual({ projects: ['demo', 'lucia'], servers: ['claude_ai_Claude_Docs', 'playwright'] });

    expect((await list(`?since=${WEEK_AGO}&project=demo`)).body.items).toHaveLength(5);
    expect((await list(`?since=${WEEK_AGO}&session_id=s2`)).body.unused_deferred).toStrictEqual([]);
  });

  it('solo cuenta las invocaciones del periodo', async () => {
    await seed();
    const { body } = await list(`?since=${minutesAgo(26).toISOString()}`);
    expect(body.items.map((i) => i.status)).toStrictEqual(['no_response', 'interrupted', 'error']);
  });

  it.each([[''], ['?since=ayer'], [`?since=${WEEK_AGO}&server=`], [`?since=${WEEK_AGO}&kind=x`]])('responde 400 con "%s"', async (query) => {
    expect((await list(query)).status).toBe(400);
  });
});

describe('AC-101: imagen en una respuesta {content:[…]}', () => {
  it('la consulta SQL marca has_image también con content', async () => {
    await pre(minutesAgo(10), SCREENSHOT, 'c1');
    await post(minutesAgo(10, 1), SCREENSHOT, 'c1', { content: IMAGE });
    await pre(minutesAgo(9), NAVIGATE, 'c2');
    await post(minutesAgo(9, 1), NAVIGATE, 'c2', { content: [{ type: 'text', text: 'ok' }] });
    const { body } = await list();
    expect(body.items.map((i) => [i.tool, i.has_image])).toStrictEqual([
      ['browser_navigate', false],
      ['browser_take_screenshot', true],
    ]);
  });
});
