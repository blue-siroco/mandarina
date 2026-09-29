import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

// Mediodía local del 25 de septiembre: el día natural (`TZ`) empieza 12 h antes.
const NOW = new Date(2026, 8, 25, 12, 0, 0);
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const END_OF_DAY = new Date(2026, 8, 26, 0, 0, 0).toISOString();

let app: FastifyInstance;
let home: string;
let dir: string;

const start = async (databaseFile = ':memory:') => {
  app = await buildApp({
    databaseFile,
    claudeHomeMount: home,
    clock: { now: () => NOW },
    budgets: { intervalMs: 0, spendingTtlMs: 0 },
  });
  await app.ready();
};

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'mandarina-budgets-'));
  dir = mkdtempSync(join(tmpdir(), 'mandarina-budgets-db-'));
  await start();
});

afterEach(async () => {
  await app.close();
  rmSync(home, { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
});

async function ingest(session: string, project: string, eventType = 'prompt.submitted', extra: Record<string, unknown> = {}) {
  await app.inject({
    method: 'POST',
    url: '/api/v1/events',
    payload: {
      schema_version: 1,
      harness: 'claude-code',
      project,
      directory: `/code/${project}`,
      session_id: session,
      event_type: eventType,
      native_event_type: 'X',
      occurred_at: NOW.toISOString(),
      transcript_path: `/home/dev/.claude/projects/${project}/${session}.jsonl`,
      payload: {},
      ...extra,
    },
  });
}

/** Una respuesta de Sonnet 5 (10 $ por millón de salida) que cuesta `usd`. */
const reply = (id: string, usd: number, minutes: number) => ({
  type: 'assistant',
  timestamp: minutesAgo(minutes).toISOString(),
  message: { id, model: 'claude-sonnet-5', usage: { output_tokens: Math.round((usd / 10) * 1_000_000) } },
});

function writeTranscript(project: string, session: string, lines: object[]) {
  const file = join(home, 'projects', project, `${session}.jsonl`);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'));
}

/** s1 (demo) lleva 9,50 $ de vida y 5,50 $ hoy; s2 (lucia) lleva 1 $ hoy. */
async function seed() {
  await ingest('s1', 'demo');
  await ingest('s2', 'lucia');
  writeTranscript('demo', 's1', [reply('a', 4, 25 * 60), reply('b', 3, 30), reply('c', 2.5, 20)]);
  writeTranscript('lucia', 's2', [reply('d', 1, 10)]);
}

const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }) });
const create = async (body: Record<string, unknown>) => (await req('POST', '/api/v1/budgets', body)).json();
const budgets = async () => (await req('GET', '/api/v1/budgets')).json<{ items: any[] }>().items;
const byId = async (id: string) => (await budgets()).find((b) => b.id === id)!;
const status = async (session: string, project: string) =>
  (await req('GET', `/api/v1/budgets/status?session_id=${session}&project=${project}`)).json();

describe('AC-76: /api/v1/budgets', () => {
  it('crea un Presupuesto con los valores por defecto', async () => {
    const response = await req('POST', '/api/v1/budgets', { scope: 'global_day', limit_usd: 50 });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: expect.any(String),
      scope: 'global_day',
      project: null,
      limit_usd: 50,
      warn_ratio: 0.8,
      action: 'stop',
      enabled: true,
      state: 'within',
      spent_usd: 0,
      subjects: [{ session_id: null, project: null, spent_usd: 0, ratio: 0, state: 'within', allowed: false }],
      sessions_tracked: 0,
      allowances: [],
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
    });
  });

  it('lista por orden de creación, edita, desactiva y borra', async () => {
    const first = await create({ scope: 'global_day', limit_usd: 50 });
    const second = await create({ scope: 'project_day', project: 'demo', limit_usd: 6, action: 'warn' });
    expect((await budgets()).map((b) => b.id)).toStrictEqual([first.id, second.id]);

    const edited = await req('PUT', `/api/v1/budgets/${first.id}`, { scope: 'global_day', limit_usd: 80, warn_ratio: 0.5, action: 'warn', enabled: false });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ id: first.id, limit_usd: 80, warn_ratio: 0.5, action: 'warn', enabled: false, created_at: NOW.toISOString() });

    expect((await req('DELETE', `/api/v1/budgets/${first.id}`)).statusCode).toBe(204);
    expect((await budgets()).map((b) => b.id)).toStrictEqual([second.id]);
    expect((await req('DELETE', `/api/v1/budgets/${first.id}`)).statusCode).toBe(404);
  });

  it('responde 400 a valores inválidos y 404 a un id que no existe', async () => {
    for (const body of [
      { scope: 'week', limit_usd: 5 },
      { scope: 'project_day', limit_usd: 5 },
      { scope: 'global_day', project: 'demo', limit_usd: 5 },
      { scope: 'global_day', limit_usd: 0 },
      { scope: 'global_day', limit_usd: 5, warn_ratio: 1.5 },
      { scope: 'global_day', limit_usd: 5, action: 'kill' },
    ]) {
      const response = await req('POST', '/api/v1/budgets', body);
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toEqual(expect.any(String));
    }
    expect((await req('PUT', '/api/v1/budgets/no-existe', { scope: 'global_day', limit_usd: 5 })).statusCode).toBe(404);
    expect((await req('PUT', `/api/v1/budgets/${(await create({ scope: 'global_day', limit_usd: 5 })).id}`, { limit_usd: -1 })).statusCode).toBe(400);
  });

  it('cambiar el ámbito o el Proyecto borra las excepciones', async () => {
    await seed();
    const budget = await create({ scope: 'session', limit_usd: 5 });
    await req('POST', `/api/v1/budgets/${budget.id}/allowances`, { session_id: 's1' });
    expect((await byId(budget.id)).allowances).toHaveLength(1);
    await req('PUT', `/api/v1/budgets/${budget.id}`, { scope: 'session', limit_usd: 9 });
    expect((await byId(budget.id)).allowances).toHaveLength(1);
    await req('PUT', `/api/v1/budgets/${budget.id}`, { scope: 'session', project: 'demo', limit_usd: 9 });
    expect((await byId(budget.id)).allowances).toHaveLength(0);
  });

  it('sobrevive a un reinicio del backend', async () => {
    await app.close();
    const file = join(dir, 'mandarina.sqlite');
    await start(file);
    const budget = await create({ scope: 'project_day', project: 'demo', limit_usd: 6 });
    await req('POST', `/api/v1/budgets/${budget.id}/allowances`, { project: 'demo' });
    await app.close();
    await start(file);
    const [restored] = await budgets();
    expect(restored).toMatchObject({ id: budget.id, scope: 'project_day', project: 'demo', limit_usd: 6 });
    expect(restored.allowances).toHaveLength(1);
  });
});

describe('AC-77: gasto y estado', () => {
  beforeEach(seed);

  it('un Presupuesto por Sesión mira la vida entera de cada Sesión y lista las Cerca o Superadas', async () => {
    const budget = await create({ scope: 'session', limit_usd: 5 });
    const described = await byId(budget.id);
    expect(described.state).toBe('exceeded');
    expect(described.spent_usd).toBe(9.5);
    expect(described.sessions_tracked).toBe(2);
    expect(described.subjects).toStrictEqual([
      { session_id: 's1', project: 'demo', spent_usd: 9.5, ratio: 1.9, state: 'exceeded', allowed: false },
    ]);
  });

  it('un Presupuesto por Proyecto y día suma solo lo de hoy de ese Proyecto', async () => {
    const budget = await create({ scope: 'project_day', project: 'demo', limit_usd: 6 });
    const described = await byId(budget.id);
    // 3 + 2,5 de hoy; el 4 $ de ayer no cuenta. 5,5 / 6 pasa del umbral del 80 %.
    expect(described).toMatchObject({ state: 'near', spent_usd: 5.5, sessions_tracked: 0 });
    expect(described.subjects).toStrictEqual([{ session_id: null, project: 'demo', spent_usd: 5.5, ratio: 5.5 / 6, state: 'near', allowed: false }]);
  });

  it('el global del día suma todos los Proyectos', async () => {
    const budget = await create({ scope: 'global_day', limit_usd: 20 });
    expect(await byId(budget.id)).toMatchObject({ state: 'within', spent_usd: 6.5 });
  });

  it('un Presupuesto por Sesión con Proyecto solo mira las Sesiones de ese Proyecto', async () => {
    const budget = await create({ scope: 'session', project: 'lucia', limit_usd: 0.5 });
    const described = await byId(budget.id);
    expect(described.sessions_tracked).toBe(1);
    expect(described.subjects.map((s: any) => s.session_id)).toStrictEqual(['s2']);
  });

  it('las Sesiones sin actividad hoy no cuentan', async () => {
    await ingest('viejo', 'demo', 'prompt.submitted', { received_at: 'x' });
    writeTranscript('demo', 'viejo', [reply('z', 100, 3 * 24 * 60)]);
    const budget = await create({ scope: 'global_day', limit_usd: 20 });
    expect((await byId(budget.id)).spent_usd).toBe(6.5);
  });

  it('el estado cambia en el límite y en el umbral', async () => {
    const budget = await create({ scope: 'global_day', limit_usd: 6.5 });
    expect((await byId(budget.id)).state).toBe('near');
    await req('PUT', `/api/v1/budgets/${budget.id}`, { scope: 'global_day', limit_usd: 6.49 });
    expect((await byId(budget.id)).state).toBe('exceeded');
    await req('PUT', `/api/v1/budgets/${budget.id}`, { scope: 'global_day', limit_usd: 6.5 / 0.8 + 0.01 });
    expect((await byId(budget.id)).state).toBe('within');
  });

  it('un Presupuesto desactivado sigue enseñando el gasto', async () => {
    const budget = await create({ scope: 'global_day', limit_usd: 5, enabled: false });
    expect(await byId(budget.id)).toMatchObject({ enabled: false, state: 'exceeded', spent_usd: 6.5 });
  });

  it('cuenta los Subagentes de la Sesión y una Sesión sin Transcript gasta 0', async () => {
    writeTranscript('demo', 's1', [reply('b', 3, 30)]);
    mkdirSync(join(home, 'projects', 'demo', 's1', 'subagents'), { recursive: true });
    writeTranscript('demo', 's1/subagents/agent-a1', [reply('h', 2, 25)]);
    await ingest('sin-transcript', 'demo', 'prompt.submitted', { transcript_path: null });
    const budget = await create({ scope: 'project_day', project: 'demo', limit_usd: 10 });
    expect((await byId(budget.id)).spent_usd).toBe(5);
  });
});

describe('AC-78: excepciones', () => {
  beforeEach(seed);
  const allow = (id: string, body: unknown) => req('POST', `/api/v1/budgets/${id}/allowances`, body);

  it('una excepción de Sesión dura lo que la Sesión y deja seguir a esa Sesión', async () => {
    const budget = await create({ scope: 'session', limit_usd: 5 });
    const response = await allow(budget.id, { session_id: 's1' });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toStrictEqual({ id: expect.any(String), budget_id: budget.id, session_id: 's1', project: null, until: null, created_at: NOW.toISOString() });
    const described = await byId(budget.id);
    expect(described.subjects[0]).toMatchObject({ session_id: 's1', state: 'exceeded', allowed: true });
    expect(described.allowances).toHaveLength(1);
  });

  it('una excepción de Proyecto dura hasta el fin del día natural', async () => {
    const budget = await create({ scope: 'project_day', project: 'demo', limit_usd: 5 });
    const response = await allow(budget.id, { project: 'demo' });
    expect(response.statusCode).toBe(201);
    expect(response.json().until).toBe(END_OF_DAY);
    expect((await byId(budget.id)).subjects[0].allowed).toBe(true);
  });

  it('se puede quitar', async () => {
    const budget = await create({ scope: 'session', limit_usd: 5 });
    const allowance = (await allow(budget.id, { session_id: 's1' })).json();
    expect((await req('DELETE', `/api/v1/budgets/${budget.id}/allowances/${allowance.id}`)).statusCode).toBe(204);
    expect((await byId(budget.id)).subjects[0].allowed).toBe(false);
    expect((await req('DELETE', `/api/v1/budgets/${budget.id}/allowances/${allowance.id}`)).statusCode).toBe(404);
    expect((await req('DELETE', `/api/v1/budgets/no-existe/allowances/${allowance.id}`)).statusCode).toBe(404);
  });

  it('responde 400 si vienen los dos o ninguno, o no encaja con el ámbito', async () => {
    const session = await create({ scope: 'session', project: 'demo', limit_usd: 5 });
    const day = await create({ scope: 'project_day', project: 'demo', limit_usd: 5 });
    const global = await create({ scope: 'global_day', limit_usd: 5 });
    expect((await allow(session.id, {})).statusCode).toBe(400);
    expect((await allow(session.id, { session_id: 's1', project: 'demo' })).statusCode).toBe(400);
    expect((await allow(day.id, { session_id: 's1' })).statusCode).toBe(400);
    expect((await allow(day.id, { project: 'lucia' })).statusCode).toBe(400);
    expect((await allow(session.id, { project: 'lucia' })).statusCode).toBe(400);
    expect((await allow(global.id, { project: 'lucia' })).statusCode).toBe(201);
    expect((await allow('no-existe', { project: 'demo' })).statusCode).toBe(404);
  });

  it('una excepción caducada ya no figura', async () => {
    const budget = await create({ scope: 'project_day', project: 'demo', limit_usd: 5 });
    await allow(budget.id, { project: 'demo' });
    await app.close();
    // Al día siguiente la excepción de ayer ya no vale.
    app = await buildApp({
      databaseFile: ':memory:',
      claudeHomeMount: home,
      clock: { now: () => new Date(2026, 8, 26, 9, 0, 0) },
      budgets: { intervalMs: 0, spendingTtlMs: 0 },
    });
    await app.ready();
    expect(await budgets()).toStrictEqual([]);
  });
});

describe('AC-79: GET /api/v1/budgets/status', () => {
  beforeEach(seed);

  it('para a la Sesión superada con el motivo y sigue con la que no', async () => {
    const budget = await create({ scope: 'session', limit_usd: 5 });
    expect(await status('s1', 'demo')).toStrictEqual({
      stop: {
        budget_id: budget.id,
        scope: 'session',
        reason: 'Presupuesto por Sesión superado: ~$9,50 de ~$5,00. Amplía el límite o permite seguir en Mandarina (/presupuestos).',
        spent_usd: 9.5,
        limit_usd: 5,
      },
      checked_at: NOW.toISOString(),
    });
    expect((await status('s2', 'lucia')).stop).toBeNull();
  });

  it('un Presupuesto Cerca, en warn, desactivado o dentro no detiene', async () => {
    await create({ scope: 'global_day', limit_usd: 6.5 });
    await create({ scope: 'session', limit_usd: 1, action: 'warn' });
    await create({ scope: 'session', limit_usd: 1, enabled: false });
    await create({ scope: 'project_day', project: 'demo', limit_usd: 100 });
    expect((await status('s1', 'demo')).stop).toBeNull();
  });

  it('el del Proyecto y día solo detiene a ese Proyecto; el global, a todos', async () => {
    const day = await create({ scope: 'project_day', project: 'demo', limit_usd: 5 });
    expect((await status('s1', 'demo')).stop?.budget_id).toBe(day.id);
    expect((await status('s2', 'lucia')).stop).toBeNull();
    const global = await create({ scope: 'global_day', limit_usd: 6 });
    expect((await status('s2', 'lucia')).stop).toMatchObject({ budget_id: global.id, scope: 'global_day' });
  });

  it('un Presupuesto por Sesión con otro Proyecto no aplica', async () => {
    await create({ scope: 'session', project: 'lucia', limit_usd: 1 });
    expect((await status('s1', 'demo')).stop).toBeNull();
    expect((await status('s2', 'lucia')).stop).toBeNull();
  });

  it('con varios superados, dice el de más gasto sobre su límite', async () => {
    await create({ scope: 'global_day', limit_usd: 6 });
    const worse = await create({ scope: 'session', limit_usd: 2 });
    expect((await status('s1', 'demo')).stop?.budget_id).toBe(worse.id);
  });

  it('las excepciones vigentes dejan seguir', async () => {
    const session = await create({ scope: 'session', limit_usd: 5 });
    await req('POST', `/api/v1/budgets/${session.id}/allowances`, { session_id: 's1' });
    expect((await status('s1', 'demo')).stop).toBeNull();

    const global = await create({ scope: 'global_day', limit_usd: 6 });
    expect((await status('s2', 'lucia')).stop?.budget_id).toBe(global.id);
    await req('POST', `/api/v1/budgets/${global.id}/allowances`, { project: 'lucia' });
    expect((await status('s2', 'lucia')).stop).toBeNull();
    // La excepción es de Lucia: demo sigue parado por el global.
    expect((await status('s1', 'demo')).stop?.budget_id).toBe(global.id);
  });

  it('recalcula al momento el gasto de la Sesión que consulta', async () => {
    await create({ scope: 'session', limit_usd: 5 });
    expect((await status('s2', 'lucia')).stop).toBeNull();
    writeTranscript('lucia', 's2', [reply('d', 1, 10), reply('e', 6, 5)]);
    expect((await status('s2', 'lucia')).stop).toMatchObject({ spent_usd: 7 });
  });

  it('una Sesión nueva, sin Eventos ni Transcript, gasta 0', async () => {
    await create({ scope: 'session', limit_usd: 5 });
    expect((await status('nueva', 'demo')).stop).toBeNull();
  });

  it('sin Presupuestos activos con stop responde enseguida que no hay nada que parar', async () => {
    expect(await status('s1', 'demo')).toStrictEqual({ stop: null, checked_at: NOW.toISOString() });
  });

  it('responde 400 sin session_id o sin project', async () => {
    expect((await req('GET', '/api/v1/budgets/status?project=demo')).statusCode).toBe(400);
    expect((await req('GET', '/api/v1/budgets/status?session_id=s1')).statusCode).toBe(400);
    expect((await req('GET', '/api/v1/budgets/status?session_id=&project=demo')).statusCode).toBe(400);
  });
});

describe('AC-81: budget.state por el WebSocket', () => {
  beforeEach(seed);

  async function listen() {
    const ws = await app.injectWS('/ws');
    const messages: any[] = [];
    ws.on('message', (d) => {
      const message = JSON.parse(d.toString());
      if (message.type === 'budget.state') messages.push(message);
    });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
    return { ws, messages, settle };
  }

  it('difunde lo que ya está Superado o Cerca una vez, y no lo repite', async () => {
    const { ws, messages, settle } = await listen();
    const global = await create({ scope: 'global_day', limit_usd: 6 });
    await settle();
    expect(messages).toStrictEqual([
      {
        type: 'budget.state',
        budget_id: global.id,
        scope: 'global_day',
        project: null,
        session_id: null,
        action: 'stop',
        state: 'exceeded',
        previous_state: 'within',
        spent_usd: 6.5,
        limit_usd: 6,
      },
    ]);
    await app.budgets.tick();
    await app.budgets.tick();
    await settle();
    expect(messages).toHaveLength(1);
    ws.terminate();
  });

  it('un Presupuesto que ya nace Dentro no difunde nada', async () => {
    const { ws, messages, settle } = await listen();
    await create({ scope: 'global_day', limit_usd: 100 });
    await settle();
    expect(messages).toStrictEqual([]);
    ws.terminate();
  });

  it('difunde la transición a Dentro al ampliar el límite y al borrarlo o desactivarlo', async () => {
    const { ws, messages, settle } = await listen();
    const global = await create({ scope: 'global_day', limit_usd: 6 });
    await req('PUT', `/api/v1/budgets/${global.id}`, { scope: 'global_day', limit_usd: 100 });
    await settle();
    expect(messages.map((m) => [m.state, m.previous_state])).toStrictEqual([['exceeded', 'within'], ['within', 'exceeded']]);

    await req('PUT', `/api/v1/budgets/${global.id}`, { scope: 'global_day', limit_usd: 6 });
    await req('PUT', `/api/v1/budgets/${global.id}`, { scope: 'global_day', limit_usd: 6, enabled: false });
    await settle();
    expect(messages.slice(2).map((m) => [m.state, m.previous_state])).toStrictEqual([['exceeded', 'within'], ['within', 'exceeded']]);

    await req('PUT', `/api/v1/budgets/${global.id}`, { scope: 'global_day', limit_usd: 6, enabled: true });
    await req('DELETE', `/api/v1/budgets/${global.id}`);
    await settle();
    expect(messages.at(-1)).toMatchObject({ state: 'within', previous_state: 'exceeded' });
    ws.terminate();
  });

  it('un Presupuesto por Sesión difunde por cada Sesión y con una excepción no avisa', async () => {
    const { ws, messages, settle } = await listen();
    const budget = await create({ scope: 'session', limit_usd: 5 });
    await settle();
    expect(messages).toMatchObject([{ scope: 'session', session_id: 's1', project: 'demo', state: 'exceeded' }]);
    await req('POST', `/api/v1/budgets/${budget.id}/allowances`, { session_id: 's1' });
    await settle();
    expect(messages.at(-1)).toMatchObject({ session_id: 's1', state: 'within', previous_state: 'exceeded' });
    ws.terminate();
  });
});

describe('AC-84: budget_stopped en las Sesiones', () => {
  beforeEach(seed);

  it('es verdadero si el último Bloqueo de la Sesión lo produjo la regla budget', async () => {
    const stopped = async (id: string) => (await req('GET', '/api/v1/sessions')).json<{ items: any[] }>().items.find((s) => s.session_id === id)!.budget_stopped;
    expect(await stopped('s1')).toBe(false);

    await ingest('s1', 'demo', 'tool.blocked', { block: { rule: 'budget', reason: 'Presupuesto por Sesión superado' } });
    expect(await stopped('s1')).toBe(true);
    expect(await stopped('s2')).toBe(false);
    expect((await req('GET', '/api/v1/sessions/s1')).json().budget_stopped).toBe(true);

    await ingest('s1', 'demo', 'tool.blocked', { block: { rule: 'dangerous-rm', reason: 'rm -rf' } });
    expect(await stopped('s1')).toBe(false);
  });
});
