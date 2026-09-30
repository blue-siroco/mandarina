import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

let app: FastifyInstance;
let home: string;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'mandarina-waiting-'));
  app = await buildApp({ databaseFile: ':memory:', claudeHomeMount: home, clock: { now: () => NOW } });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(home, { recursive: true, force: true });
});

const event = (session: string, eventType: string, at: Date, extra: Record<string, unknown> = {}) => ({
  schema_version: 1,
  harness: 'claude-code',
  project: 'demo',
  directory: '/code/demo',
  session_id: session,
  subagent_id: null,
  event_type: eventType,
  native_event_type: 'X',
  tool_name: null,
  occurred_at: at.toISOString(),
  transcript_path: null,
  payload: {},
  ...extra,
});

const ingest = (body: unknown) => app.inject({ method: 'POST', url: '/api/v1/events', payload: body as object });
const get = async <T = Record<string, unknown>>(url: string) => (await app.inject({ method: 'GET', url })).json<T>();

const secret = 'sk-ant-api03-abcdefghijklmnop';

describe('AC-87: la ingesta acepta los Eventos de espera', () => {
  it.each([
    ['permission.requested', 'PermissionRequest', { tool_name: 'Bash', payload: { tool_input: { command: `curl -H "x-api-key: ${secret}"` } } }],
    ['session.notified', 'Notification', { payload: { notification_type: 'permission_prompt', message: `usa ${secret}` } }],
  ])('%s: 2xx, payload enmascarado, listado y difusión como event.ingested', async (type, native, extra) => {
    const ws = await app.injectWS('/ws');
    const message = new Promise<string>((resolve) => ws.once('message', (d) => resolve(d.toString())));

    const response = await ingest(event('s1', type, minutesAgo(1), { native_event_type: native, ...extra }));
    expect(response.statusCode).toBe(202);

    const live = await message;
    expect(JSON.parse(live)).toMatchObject({ type: 'event.ingested', event: { event_type: type, native_event_type: native } });
    expect(live).not.toContain(secret);
    expect(live).toContain('[REDACTED_API_KEY]');

    const listed = await get<{ items: Array<Record<string, unknown>> }>('/api/v1/events');
    expect(listed.items[0]).toMatchObject({ event_type: type, native_event_type: native });
    expect(JSON.stringify(listed)).not.toContain(secret);
    ws.terminate();
  });

  it('un Tipo desconocido sigue rechazándose con 400', async () => {
    expect((await ingest(event('s1', 'permission.granted', minutesAgo(1)))).statusCode).toBe(400);
  });

  it('cuentan en event_count pero no como tool.pre ni como prompt ni como Turno', async () => {
    await ingest(event('s1', 'prompt.submitted', minutesAgo(3)));
    await ingest(event('s1', 'permission.requested', minutesAgo(2), { tool_name: 'Bash', payload: { tool_input: { command: 'ls' } } }));
    await ingest(event('s1', 'session.notified', minutesAgo(1), { payload: { notification_type: 'permission_prompt', message: 'm' } }));
    expect(await get('/api/v1/sessions/s1')).toMatchObject({ event_count: 3, tool_count: 0, prompt_count: 1, turn_count: 1 });
  });
});

describe('AC-92: la API expone la Actividad Esperando', () => {
  it('GET /sessions y /sessions/:id devuelven activity waiting y el campo waiting (null en las demás)', async () => {
    await ingest(event('perm', 'prompt.submitted', minutesAgo(4)));
    await ingest(event('perm', 'tool.pre', minutesAgo(3), { tool_name: 'Bash', payload: { tool_input: { command: 'rm -rf build' } } }));
    await ingest(event('perm', 'permission.requested', minutesAgo(2), { tool_name: 'Bash', payload: { tool_input: { command: 'rm -rf build' } } }));
    await ingest(event('busy', 'prompt.submitted', minutesAgo(1)));

    const list = await get<{ items: Array<Record<string, unknown>> }>('/api/v1/sessions');
    const byId = Object.fromEntries(list.items.map((s) => [s.session_id, s]));
    expect(byId.perm).toMatchObject({
      activity: 'waiting',
      waiting: { since: minutesAgo(2).toISOString(), reason: 'permission', tool: 'Bash', summary: 'rm -rf build', subagent: null },
      // Conserva la herramienta abierta.
      current_tool: { name: 'Bash' },
    });
    expect(byId.busy).toMatchObject({ activity: 'working', waiting: null });
    expect(await get('/api/v1/sessions/perm')).toMatchObject({ activity: 'waiting', waiting: { reason: 'permission' } });
  });

  it('la pregunta lleva el texto ya enmascarado y el Subagente que espera', async () => {
    await ingest(event('q', 'prompt.submitted', minutesAgo(5)));
    await ingest(event('q', 'subagent.started', minutesAgo(4), { subagent_id: 'a1', payload: { agent_type: 'Explore' } }));
    await ingest(
      event('q', 'tool.pre', minutesAgo(1), {
        subagent_id: 'a1',
        tool_name: 'AskUserQuestion',
        payload: { tool_input: { questions: [{ question: `¿Usamos ${secret}?` }] } },
      }),
    );
    const { waiting } = await get<{ waiting: Record<string, unknown> }>('/api/v1/sessions/q');
    expect(waiting).toMatchObject({ reason: 'question', tool: 'AskUserQuestion', subagent: { id: 'a1', type: 'Explore' } });
    expect(waiting.summary).toContain('[REDACTED_API_KEY]');
    expect(JSON.stringify(waiting)).not.toContain(secret);
  });

  it('una Sesión Cerrada tiene activity y waiting a null', async () => {
    await ingest(event('c', 'prompt.submitted', minutesAgo(4)));
    await ingest(event('c', 'permission.requested', minutesAgo(3), { tool_name: 'Bash' }));
    await ingest(event('c', 'session.ended', minutesAgo(2)));
    expect(await get('/api/v1/sessions/c')).toMatchObject({ state: 'closed', activity: null, waiting: null });
  });

  it('GET /metrics cuenta las Esperando aparte y el total cuadra', async () => {
    await ingest(event('w', 'prompt.submitted', minutesAgo(3)));
    await ingest(event('w', 'permission.requested', minutesAgo(2), { tool_name: 'Bash' }));
    await ingest(event('t', 'prompt.submitted', minutesAgo(3)));
    await ingest(event('t', 'turn.ended', minutesAgo(2)));
    await ingest(event('k', 'prompt.submitted', minutesAgo(1)));

    const { sessions } = await get<{ sessions: Record<string, number> }>(`/api/v1/metrics?since=${minutesAgo(60).toISOString()}`);
    expect(sessions).toMatchObject({ total: 3, working: 1, paused: 1, waiting: 1, orphaned: 0, closed: 0 });
  });
});
