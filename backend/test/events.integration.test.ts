import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const validEvent = {
  schema_version: 1,
  harness: 'claude-code',
  project: 'demo',
  directory: 'C:\\Codev\\demo',
  session_id: 'sess-1',
  subagent_id: null,
  event_type: 'tool.pre',
  native_event_type: 'PreToolUse',
  tool_name: 'Bash',
  occurred_at: '2026-09-25T10:00:00.000Z',
  transcript_path: 'C:\\Users\\dev\\.claude\\projects\\demo\\sess-1.jsonl',
  payload: { tool_input: { command: 'npm test' } },
};

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({ databaseFile: ':memory:' });
  // `inject` espera a `ready` por sí solo; `injectWS` no.
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const ingest = (body: unknown) => app.inject({ method: 'POST', url: '/api/v1/events', payload: body as object });
const list = async (query = '') =>
  (await app.inject({ method: 'GET', url: `/api/v1/events${query}` })).json<{ items: Array<Record<string, unknown>> }>();

describe('GET /api/v1/health', () => {
  it('responde ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('AC-05: ingesta de un Evento válido', () => {
  it('responde 202 con id y lo persiste con received_at', async () => {
    const response = await ingest(validEvent);
    expect(response.statusCode).toBe(202);
    const { id } = response.json<{ id: string }>();

    const [stored] = (await list()).items;
    expect(stored).toMatchObject({ ...validEvent, id });
    expect(Date.parse(stored?.received_at as string)).not.toBeNaN();
  });

  it('rellena con null los campos opcionales ausentes', async () => {
    const { subagent_id, tool_name, transcript_path, ...minimal } = validEvent;
    await ingest(minimal);
    expect((await list()).items[0]).toMatchObject({ subagent_id: null, tool_name: null, transcript_path: null });
  });
});

describe('AC-04: la ingesta rechaza Eventos inválidos', () => {
  it.each([
    ['sin session_id', { ...validEvent, session_id: undefined }],
    ['con event_type desconocido', { ...validEvent, event_type: 'session.stopped' }],
    ['con schema_version no soportada', { ...validEvent, schema_version: 2 }],
    ['con occurred_at que no es fecha', { ...validEvent, occurred_at: 'ayer' }],
    ['con campos extra', { ...validEvent, extra: true }],
    ['con payload que no es objeto', { ...validEvent, payload: 'x' }],
  ])('%s → 400 sin persistir ni difundir', async (_name, body) => {
    const ws = await app.injectWS('/ws');
    const received: string[] = [];
    ws.on('message', (data) => received.push(data.toString()));

    const response = await ingest(body);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('message');
    expect((await list()).items).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received).toHaveLength(0);
    ws.terminate();
  });
});

describe('AC-60, AC-62: secretos enmascarados con su tipo', () => {
  it('no persiste, ni devuelve, ni difunde el secreto, y deja un marcador', async () => {
    const secret = 'sk-ant-api03-abcdefghijklmnop';
    const ws = await app.injectWS('/ws');
    const message = new Promise<string>((resolve) => ws.once('message', (d) => resolve(d.toString())));

    await ingest({ ...validEvent, payload: { tool_input: { command: `curl -H "x-api-key: ${secret}"` } } });

    const live = await message;
    expect(live).not.toContain(secret);
    expect(live).toContain('[REDACTED_API_KEY]');
    expect(JSON.stringify(await list())).not.toContain(secret);
    ws.terminate();
  });

  it('enmascara también el Bloqueo que trae el Adaptador', async () => {
    await ingest({
      ...validEvent,
      event_type: 'tool.blocked',
      block: { rule: 'secret-in-command', reason: 'El comando lleva la clave sk-ant-api03-abcdefghijklmnop' },
    });
    const stored = (await list()).items[0] as unknown as { block: { reason: string } };
    expect(stored.block.reason).toBe('El comando lleva la clave [REDACTED_API_KEY]');
  });

  it('enmascarar lo ya enmascarado por el Adaptador no cambia nada', async () => {
    const payload = { prompt: 'usa [REDACTED_API_KEY] y API_KEY=[REDACTED_PASSWORD]' };
    await ingest({ ...validEvent, payload });
    expect((await list()).items[0]?.payload).toStrictEqual(payload);
  });
});

describe('AC-61: datos personales enmascarados', () => {
  it('enmascara correos, teléfonos, IBAN, tarjetas y DNI en cualquier texto del payload', async () => {
    await ingest({
      ...validEvent,
      payload: { prompt: 'escribe a ana@example.com o al +34612345678', tool_input: { command: 'echo ES9121000418450200051332 4111 1111 1111 1111 12345678Z' } },
    });
    const { payload } = (await list()).items[0]!;
    expect(payload).toStrictEqual({
      prompt: 'escribe a [REDACTED_EMAIL] o al [REDACTED_PHONE]',
      tool_input: { command: 'echo [REDACTED_IBAN] [REDACTED_CARD] [REDACTED_ID]' },
    });
  });
});

describe('AC-07: difusión en vivo', () => {
  it('todos los clientes conectados reciben el Evento tal como lo devuelve la API', async () => {
    const clients = await Promise.all([app.injectWS('/ws'), app.injectWS('/ws')]);
    const messages = clients.map(
      (ws) => new Promise<unknown>((resolve) => ws.once('message', (d) => resolve(JSON.parse(d.toString())))),
    );

    await ingest(validEvent);
    const [stored] = (await list()).items;

    for (const message of await Promise.all(messages)) {
      expect(message).toEqual({ type: 'event.ingested', event: stored });
    }
    clients.forEach((ws) => ws.terminate());
  });
});

describe('AC-08: consulta paginada', () => {
  beforeEach(async () => {
    for (let i = 1; i <= 5; i++) await ingest({ ...validEvent, session_id: `sess-${i}` });
  });

  it('devuelve los más recientes primero', async () => {
    const sessions = (await list()).items.map((e) => e.session_id);
    expect(sessions).toEqual(['sess-5', 'sess-4', 'sess-3', 'sess-2', 'sess-1']);
  });

  it('respeta limit', async () => {
    expect((await list('?limit=2')).items.map((e) => e.session_id)).toEqual(['sess-5', 'sess-4']);
  });

  it('pagina hacia atrás con before', async () => {
    const [, second] = (await list('?limit=2')).items;
    const older = (await list(`?limit=2&before=${second?.id as string}`)).items;
    expect(older.map((e) => e.session_id)).toEqual(['sess-3', 'sess-2']);
  });

  it.each(['?limit=0', '?limit=501', '?limit=abc', '?before=no-existe'])('%s → 400', async (query) => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/events${query}` });
    expect(response.statusCode).toBe(400);
  });
});
