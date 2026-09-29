import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const WEEK_AGO = '2026-09-18T12:00:00.000Z';
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

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
  eventType: string;
  payload?: Record<string, unknown>;
}

async function ingest(at: Date, { session = 's1', project = 'demo', subagent = null, tool = null, eventType, payload = {} }: Input) {
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
      transcript_path: null,
      payload,
    },
  });
  expect(response.statusCode).toBe(202);
  receivedAt = NOW;
  return (response.json() as { id: string }).id;
}

const prompt = (at: Date, text: string, extra: Partial<Input> = {}) =>
  ingest(at, { eventType: 'prompt.submitted', payload: { prompt: text }, ...extra });
const skill = (at: Date, name: string, extra: Partial<Input> = {}) =>
  ingest(at, { eventType: 'tool.pre', tool: 'Skill', payload: { tool_input: { skill: name }, tool_use_id: `${name}-${at.getTime()}` }, ...extra });

async function invocations(query = `?since=${WEEK_AGO}`) {
  const response = await app.inject({ method: 'GET', url: `/api/v1/skill-invocations${query}` });
  return {
    status: response.statusCode,
    body: response.json() as {
      items: Array<Record<string, unknown>>;
      stats: Array<Record<string, unknown>>;
      facets: { projects: string[] };
    },
  };
}

describe('AC-30: GET /api/v1/skill-invocations', () => {
  it('devuelve las invocaciones de la ventana, la más reciente primero, con su agregado', async () => {
    await prompt(minutesAgo(60 * 24 * 8), '/viejo', { session: 's0' });
    const user = await prompt(minutesAgo(30), '/commit');
    await ingest(minutesAgo(25), { eventType: 'turn.ended' });
    await prompt(minutesAgo(20), 'Haz el punto 1.6 de /spec/roadmap');
    const agent = await skill(minutesAgo(19), 'grilling');

    const { status, body } = await invocations();

    expect(status).toBe(200);
    expect(body.items.map((i) => i.id)).toEqual([agent, user]);
    expect(body.items[0]).toMatchObject({ skill: 'grilling', invoker: 'agent', status: 'running', turn: 2, project: 'demo', session_id: 's1' });
    expect(body.items[1]).toMatchObject({ skill: 'commit', invoker: 'user', status: 'finished', turn: 1, duration_ms: 5 * 60_000 });
    expect(body.stats).toEqual([
      { project: 'demo', skill: 'grilling', total: 1, by_invoker: { agent: 1, subagent: 0, user: 0 }, last_at: minutesAgo(19).toISOString() },
      { project: 'demo', skill: 'commit', total: 1, by_invoker: { agent: 0, subagent: 0, user: 1 }, last_at: minutesAgo(30).toISOString() },
    ]);
    expect(body.facets.projects).toEqual(['demo']);
  });

  it('numera los Turnos con toda la Sesión aunque empezara antes de la ventana', async () => {
    await prompt(minutesAgo(60 * 24 * 8), 'hola');
    await ingest(minutesAgo(60 * 24 * 8 - 1), { eventType: 'turn.ended' });
    await prompt(minutesAgo(10), '/tdd');

    const { body } = await invocations();

    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ skill: 'tdd', turn: 2 });
  });

  it('filtra por Proyecto y por Sesión sin cambiar las facetas', async () => {
    await prompt(minutesAgo(30), '/commit', { project: 'demo', session: 's1' });
    await prompt(minutesAgo(20), '/tdd', { project: 'lucia', session: 's2' });
    await prompt(minutesAgo(10), '/review', { project: 'demo', session: 's3' });

    const byProject = await invocations(`?since=${WEEK_AGO}&project=demo`);
    expect(byProject.body.items.map((i) => i.skill)).toEqual(['review', 'commit']);
    expect(byProject.body.stats.map((s) => s.skill)).toEqual(['review', 'commit']);
    expect(byProject.body.facets.projects).toEqual(['demo', 'lucia']);

    const bySession = await invocations(`?since=${WEEK_AGO}&session_id=s2`);
    expect(bySession.body.items.map((i) => i.skill)).toEqual(['tdd']);
  });

  it('atribuye al Subagente las skills que carga', async () => {
    await prompt(minutesAgo(30), 'delega');
    await ingest(minutesAgo(29), { eventType: 'subagent.started', subagent: 'a1', payload: { agent_type: 'e2e-builder' } });
    await skill(minutesAgo(28), 'tdd', { subagent: 'a1' });

    const { body } = await invocations();

    expect(body.items[0]).toMatchObject({ invoker: 'subagent', subagent_id: 'a1', subagent_type: 'e2e-builder', status: 'running' });
  });

  it.each([[''], ['?since=ayer'], [`?since=${WEEK_AGO}&kind=unit`]])('responde 400 con "%s"', async (query) => {
    expect((await invocations(query)).status).toBe(400);
  });
});
