import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const T0 = new Date('2026-09-25T12:00:00.000Z');
const secs = (n: number) => new Date(T0.getTime() + n * 1000);
const ENV = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318', OTEL_EXPORTER_OTLP_HEADERS: 'authorization=Bearer%20abc' };

let now: Date;
let home: string;
let dir: string;
let apps: FastifyInstance[];
let calls: Array<{ url: string; headers: Record<string, string>; body: any }>;
let respond: () => Promise<{ ok: boolean; status: number }>;

const fakeFetch = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
  calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
  return respond();
}) as unknown as typeof fetch;

beforeEach(() => {
  now = T0;
  home = mkdtempSync(join(tmpdir(), 'mandarina-otlp-'));
  dir = mkdtempSync(join(tmpdir(), 'mandarina-otlp-db-'));
  apps = [];
  calls = [];
  respond = async () => ({ ok: true, status: 200 });
});

afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  rmSync(home, { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
});

async function start(env: Record<string, string> = ENV, databaseFile = ':memory:') {
  const app = await buildApp({
    databaseFile,
    claudeHomeMount: home,
    clock: { now: () => now },
    otlp: { env, fetch: fakeFetch, intervalMs: 0 },
  });
  await app.ready();
  apps.push(app);
  return app;
}

async function ingest(app: FastifyInstance, session: string, eventType: string, at: Date, extra: Record<string, unknown> = {}) {
  const previous = now;
  now = at;
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/events',
    payload: {
      schema_version: 1,
      harness: 'claude-code',
      project: 'demo',
      directory: '/code/demo',
      session_id: session,
      event_type: eventType,
      native_event_type: 'X',
      occurred_at: at.toISOString(),
      payload: {},
      ...extra,
    },
  });
  now = previous;
  return response;
}

/** Un Turno de `from` a `to` segundos con una herramienta. */
async function turn(app: FastifyInstance, session: string, from: number, to: number) {
  await ingest(app, session, 'prompt.submitted', secs(from), { payload: { prompt: `turno ${from}` } });
  await ingest(app, session, 'tool.pre', secs(from + 1), { tool_name: 'Bash', payload: { tool_use_id: `t${from}` } });
  await ingest(app, session, 'tool.post', secs(from + 2), { tool_name: 'Bash', payload: { tool_use_id: `t${from}` } });
  await ingest(app, session, 'turn.ended', secs(to));
}

const status = async (app: FastifyInstance) => (await app.inject({ url: '/api/v1/exporter' })).json();

describe('AC-52: estado del exportador', () => {
  it('desactivado, responde enabled false y todo a cero', async () => {
    const app = await start({});
    expect(await status(app)).toEqual({
      enabled: false,
      endpoint_host: null,
      include_content: false,
      enabled_since: null,
      counts: { pending: 0, exported: 0, failed: 0 },
      last_exported_at: null,
      recent: [],
    });
  });

  it('activo, enseña el host sin ruta ni cabeceras, y los Turnos exportados', async () => {
    const app = await start({ ...ENV, OTEL_EXPORTER_OTLP_ENDPOINT: 'http://user:clave@collector:4318/ruta' });
    await turn(app, 's1', 10, 20);
    now = secs(60);
    await app.exporter.tick();
    const body = await status(app);
    expect(body).toMatchObject({
      enabled: true,
      endpoint_host: 'collector:4318',
      include_content: false,
      enabled_since: T0.toISOString(),
      counts: { pending: 0, exported: 1, failed: 0 },
      last_exported_at: secs(60).toISOString(),
    });
    expect(body.recent).toEqual([
      { turn_id: expect.any(String), session_id: 's1', project: 'demo', state: 'exported', attempts: 1, last_error: null, updated_at: secs(60).toISOString() },
    ]);
    expect(JSON.stringify(body)).not.toContain('clave');
    expect(JSON.stringify(body)).not.toContain('authorization');
  });
});

describe('AC-51: exportación en segundo plano', () => {
  it('exporta un Turno terminado hace 5 s o más, una sola vez, con las cabeceras configuradas', async () => {
    const app = await start();
    await turn(app, 's1', 10, 20);
    now = secs(24);
    await app.exporter.tick();
    expect(calls).toHaveLength(0);
    now = secs(25);
    await app.exporter.tick();
    await app.exporter.tick();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://collector:4318/v1/traces');
    expect(calls[0]!.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer abc' });
    const spans = calls[0]!.body.resourceSpans[0].scopeSpans[0].spans;
    expect(spans.map((s: { name: string }) => s.name)).toEqual(['turn', 'Bash']);
  });

  it('no exporta los Turnos terminados antes de activar el exportador', async () => {
    const file = join(dir, 'mandarina.sqlite');
    const before = await start({}, file);
    await turn(before, 's1', -100, -90);
    await before.close();
    apps.length = 0;
    const app = await start(ENV, file);
    await turn(app, 's2', 10, 20);
    now = secs(60);
    await app.exporter.tick();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.resourceSpans[0].scopeSpans[0].spans[0].attributes).toContainEqual({
      key: 'session.id',
      value: { stringValue: 's2' },
    });
  });

  it('exporta el Turno abierto de una Sesión Cerrada hasta su último Evento', async () => {
    const app = await start();
    await ingest(app, 's1', 'prompt.submitted', secs(10));
    await ingest(app, 's1', 'session.ended', secs(30));
    now = secs(31);
    await app.exporter.tick();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.resourceSpans[0].scopeSpans[0].spans[0].endTimeUnixNano).toBe(String(BigInt(secs(30).getTime()) * 1_000_000n));
  });

  it('no espera al colector al ingerir un Evento', async () => {
    respond = () => new Promise(() => {});
    const app = await start();
    await turn(app, 's1', 10, 20);
    now = secs(60);
    void app.exporter.tick();
    const response = await ingest(app, 's1', 'prompt.submitted', secs(61));
    expect(response.statusCode).toBe(202);
  });

  it('reintenta a los 30 s, 60 s y 120 s y tras el cuarto fallo deja el Turno como fallido sin frenar a los demás', async () => {
    respond = async () => ({ ok: false, status: 503 });
    const app = await start();
    await turn(app, 's1', 10, 20);
    now = secs(30);
    await app.exporter.tick();
    expect(calls).toHaveLength(1);
    expect((await status(app)).counts).toEqual({ pending: 1, exported: 0, failed: 0 });
    expect((await status(app)).recent[0]).toMatchObject({ state: 'pending', attempts: 1, last_error: 'HTTP 503' });

    now = secs(59);
    await app.exporter.tick();
    expect(calls).toHaveLength(1);
    now = secs(60);
    await app.exporter.tick();
    expect(calls).toHaveLength(2);
    now = secs(119);
    await app.exporter.tick();
    expect(calls).toHaveLength(2);
    now = secs(120);
    await app.exporter.tick();
    expect(calls).toHaveLength(3);
    now = secs(239);
    await app.exporter.tick();
    expect(calls).toHaveLength(3);

    // El otro Turno sí llega, aunque el primero siga fallando.
    await turn(app, 's2', 200, 210);
    respond = async () => ({ ok: true, status: 200 });
    now = secs(240);
    await app.exporter.tick();
    const sessions = calls.slice(3).map((c) => c.body.resourceSpans[0].scopeSpans[0].spans[0].attributes.find((a: any) => a.key === 'session.id').value.stringValue);
    expect(sessions.sort()).toEqual(['s1', 's2']);
    expect((await status(app)).counts).toEqual({ pending: 0, exported: 2, failed: 0 });
  });

  it('tras el cuarto intento fallido el Turno queda fallido con el último error', async () => {
    respond = async () => {
      throw new Error('connect ECONNREFUSED');
    };
    const app = await start();
    await turn(app, 's1', 10, 20);
    for (const at of [30, 60, 120, 240]) {
      now = secs(at);
      await app.exporter.tick();
    }
    now = secs(1000);
    await app.exporter.tick();
    expect(calls).toHaveLength(4);
    const body = await status(app);
    expect(body.counts).toEqual({ pending: 0, exported: 0, failed: 1 });
    expect(body.recent[0]).toMatchObject({ state: 'failed', attempts: 4, last_error: 'connect ECONNREFUSED' });
  });

  it('al reiniciar el backend no reexporta lo exportado y reanuda lo pendiente', async () => {
    const file = join(dir, 'mandarina.sqlite');
    const first = await start(ENV, file);
    await turn(first, 's1', 10, 20);
    now = secs(30);
    await first.exporter.tick();
    respond = async () => ({ ok: false, status: 500 });
    await turn(first, 's2', 40, 50);
    now = secs(60);
    await first.exporter.tick();
    expect(calls).toHaveLength(2);
    await first.close();
    apps.length = 0;

    respond = async () => ({ ok: true, status: 200 });
    const second = await start(ENV, file);
    now = secs(120);
    await second.exporter.tick();
    expect(calls).toHaveLength(3);
    expect(calls[2]!.body.resourceSpans[0].scopeSpans[0].spans[0].attributes).toContainEqual({
      key: 'session.id',
      value: { stringValue: 's2' },
    });
    expect((await status(second)).counts).toEqual({ pending: 0, exported: 2, failed: 0 });
    expect((await status(second)).enabled_since).toBe(T0.toISOString());
  });
});
