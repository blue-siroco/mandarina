import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

let app: FastifyInstance;
let home: string;

async function start(maxEvents?: number) {
  app = await buildApp({ databaseFile: ':memory:', claudeHomeMount: home, clock: { now: () => NOW }, downloads: { maxEvents } });
  await app.ready();
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'mandarina-downloads-'));
});

afterEach(async () => {
  await app.close();
  rmSync(home, { recursive: true, force: true });
});

async function ingest(
  eventType: string,
  at: Date,
  options: { session?: string; project?: string; tool?: string; subagent?: string; payload?: Record<string, unknown>; block?: object } = {},
) {
  await app.inject({
    method: 'POST',
    url: '/api/v1/events',
    payload: {
      schema_version: 1,
      harness: 'claude-code',
      project: options.project ?? 'demo',
      directory: '/code/demo',
      session_id: options.session ?? 'session-abcdef123',
      subagent_id: options.subagent ?? null,
      event_type: eventType,
      native_event_type: 'X',
      tool_name: options.tool ?? null,
      occurred_at: at.toISOString(),
      transcript_path: '/home/dev/.claude/projects/demo/session-abcdef123.jsonl',
      payload: options.payload ?? {},
      ...(options.block ? { block: options.block } : {}),
    },
  });
}

function writeTranscript(relative: string, lines: object[]) {
  const file = join(home, 'projects', 'demo', relative);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'));
}

const ndjson = (body: string) => body.split('\n').filter((l) => l !== '').map((l) => JSON.parse(l));
const eventsBody = (url: string) => app.inject({ method: 'GET', url });

async function seedSession() {
  await ingest('session.started', minutesAgo(10));
  await ingest('prompt.submitted', minutesAgo(9), { payload: { prompt: 'Arregla el login' } });
  await ingest('tool.pre', minutesAgo(8), { tool: 'Bash', payload: { tool_input: { command: 'npm test' } } });
  await ingest('tool.post', minutesAgo(7), { tool: 'Bash', payload: { tool_response: { stdout: 'ok' } } });
  await ingest('tool.blocked', minutesAgo(6), {
    tool: 'Bash',
    payload: { tool_input: { command: 'rm -rf x' } },
    block: { rule: 'destructive', reason: 'Comando destructivo' },
  });
  await ingest('turn.ended', minutesAgo(5));
}

describe('AC-142: Descarga de Sesión', () => {
  it('responde con el fichero JSON, su nombre y la Sesión, los Eventos en orden y sin contenido', async () => {
    await start();
    await seedSession();

    const res = await eventsBody('/api/v1/sessions/session-abcdef123/export');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toBe('attachment; filename="mandarina-sesion-session-.json"');
    const body = res.json();
    expect(body.export).toStrictEqual({
      kind: 'session',
      generated_at: NOW.toISOString(),
      include_content: false,
      total: 6,
      exported: 6,
      truncated: false,
      omitted: 0,
    });
    expect(body.session).toMatchObject({ session_id: 'session-abcdef123', project: 'demo', turns: [{ index: 1 }], blocks: [{ rule: 'destructive' }] });
    expect(body.events.map((e: any) => e.event_type)).toStrictEqual([
      'session.started',
      'prompt.submitted',
      'tool.pre',
      'tool.post',
      'tool.blocked',
      'turn.ended',
    ]);
    const blocked = body.events[4];
    expect(blocked.block).toStrictEqual({ rule: 'destructive' });
    for (const event of body.events) expect('payload' in event).toBe(false);
    // Ni la Sesión lleva texto libre: las claves no aparecen.
    expect('prompt' in body.session.turns[0]).toBe(false);
    expect('summary' in body.session.blocks[0]).toBe(false);
    expect('reason' in body.session.blocks[0]).toBe(true);
    expect(JSON.stringify(body)).not.toContain('Arregla el login');
    expect(JSON.stringify(body)).not.toContain('npm test');
  });

  it('una Sesión inexistente responde 404 con message', async () => {
    await start();
    const res = await eventsBody('/api/v1/sessions/nada/export');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toHaveProperty('message');
    expect((await eventsBody('/api/v1/sessions/nada/export/preview')).statusCode).toBe(404);
  });

  it('es de solo lectura: no cambia los Eventos ni el estado del exportador', async () => {
    await start();
    await seedSession();
    const before = [(await eventsBody('/api/v1/events')).json(), (await eventsBody('/api/v1/exporter')).json()];

    await eventsBody('/api/v1/sessions/session-abcdef123/export?content=true');
    await eventsBody('/api/v1/events/export?content=true');
    await eventsBody('/api/v1/sessions/session-abcdef123/export/preview');

    expect([(await eventsBody('/api/v1/events')).json(), (await eventsBody('/api/v1/exporter')).json()]).toStrictEqual(before);
  });
});

describe('AC-143: el contenido es opt-in y sale enmascarado', () => {
  it('con content=true la Sesión lleva prompts y respuestas, y ningún secreto del Transcript sale en claro', async () => {
    await start();
    await ingest('session.started', minutesAgo(10));
    await ingest('prompt.submitted', minutesAgo(9), { payload: { prompt: 'Arregla el login' } });
    await ingest('subagent.started', minutesAgo(8), { subagent: 'agent-a1', payload: { agent_type: 'Explore' } });
    await ingest('subagent.stopped', minutesAgo(7), { subagent: 'agent-a1', payload: { agent_type: 'Explore' } });
    writeTranscript('session-abcdef123.jsonl', []);
    writeTranscript('session-abcdef123/subagents/agent-a1.meta.json', [{ agentType: 'Explore', description: 'Buscar la clave' }]);
    writeTranscript('session-abcdef123/subagents/agent-a1.jsonl', [
      { type: 'user', message: { content: 'Busca la clave sk-ant-api03-abcdefghijklmnop de ana@example.com' } },
      { type: 'assistant', timestamp: minutesAgo(7.5).toISOString(), message: { content: [{ type: 'text', text: 'La clave es Bearer abcdefgh12345678.' }] } },
    ]);

    const res = await eventsBody('/api/v1/sessions/session-abcdef123/export?content=true');
    const body = res.json();
    const text = res.body;

    expect(body.export.include_content).toBe(true);
    expect(text).not.toContain('sk-ant-api03');
    expect(text).not.toContain('ana@example.com');
    expect(text).not.toContain('abcdefgh12345678');
    expect(body.session.turns[0].prompt).toBe('Arregla el login');
    expect(body.session.subagents[0].task.prompt).toBe('Busca la clave [REDACTED_API_KEY] de [REDACTED_EMAIL]');
    expect(body.session.subagents[0].result).toBe('La clave es Bearer [REDACTED_TOKEN]');
    expect(body.events.find((e: any) => e.event_type === 'prompt.submitted').payload).toStrictEqual({ prompt: 'Arregla el login' });
  });

  it('sin content, el Transcript no aporta nada de su texto', async () => {
    await start();
    await ingest('session.started', minutesAgo(10));
    await ingest('subagent.started', minutesAgo(8), { subagent: 'agent-a1', payload: { agent_type: 'Explore' } });
    await ingest('subagent.stopped', minutesAgo(7), { subagent: 'agent-a1', payload: { agent_type: 'Explore' } });
    writeTranscript('session-abcdef123.jsonl', []);
    writeTranscript('session-abcdef123/subagents/agent-a1.jsonl', [
      { type: 'assistant', timestamp: minutesAgo(7.5).toISOString(), message: { content: [{ type: 'text', text: 'Respuesta privada' }] } },
    ]);

    const res = await eventsBody('/api/v1/sessions/session-abcdef123/export');

    expect(res.body).not.toContain('Respuesta privada');
    expect('result' in res.json().session.subagents[0]).toBe(false);
    expect('task' in res.json().session.subagents[0]).toBe(false);
  });

  it('content=false equivale al valor por defecto y otro valor responde 400 en ambos endpoints', async () => {
    await start();
    await seedSession();
    expect((await eventsBody('/api/v1/sessions/session-abcdef123/export?content=false')).json().export.include_content).toBe(false);
    for (const url of [
      '/api/v1/sessions/session-abcdef123/export?content=quiza',
      '/api/v1/sessions/session-abcdef123/export/preview?content=quiza',
      '/api/v1/events/export?content=quiza',
      '/api/v1/events/export/preview?content=quiza',
    ]) {
      expect((await eventsBody(url)).statusCode, url).toBe(400);
    }
  });

  it('la Descarga de Eventos con content=true añade payload y block.reason', async () => {
    await start();
    await seedSession();
    const lines = ndjson((await eventsBody('/api/v1/events/export?content=true')).body);
    expect(lines[0].export.include_content).toBe(true);
    const blocked = lines.find((l) => l.event_type === 'tool.blocked');
    expect(blocked.block).toStrictEqual({ rule: 'destructive', reason: 'Comando destructivo' });
    expect(blocked.payload).toStrictEqual({ tool_input: { command: 'rm -rf x' } });
  });
});

describe('AC-144: Descarga de Eventos', () => {
  it('sirve JSONL con la cabecera, filtros y Eventos ascendentes sin payload por defecto', async () => {
    await start();
    await seedSession();
    await ingest('tool.pre', minutesAgo(4), { session: 'otra', project: 'otro', tool: 'Read' });

    const res = await eventsBody('/api/v1/events/export');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    expect(res.headers['content-disposition']).toBe('attachment; filename="mandarina-eventos-2026-09-25.jsonl"');
    const [head, ...events] = ndjson(res.body);
    expect(head.export).toStrictEqual({ kind: 'events', generated_at: NOW.toISOString(), include_content: false, filters: {}, total: 7, exported: 7, truncated: false, omitted: 0 });
    expect(events).toHaveLength(7);
    expect(events.map((e) => e.received_at)).toStrictEqual([...events.map((e) => e.received_at)].sort());
    for (const event of events) expect('payload' in event).toBe(false);
    expect(Object.keys(events[0]).sort()).toStrictEqual(
      ['block', 'directory', 'event_type', 'harness', 'id', 'native_event_type', 'occurred_at', 'project', 'received_at', 'session_id', 'subagent_id', 'tool_name'],
    );
  });

  it('aplica project, session_id, event_type (repetible), tool (repetible) y since', async () => {
    await start();
    await seedSession();
    await ingest('tool.pre', minutesAgo(4), { session: 'otra', project: 'otro', tool: 'Read' });
    const run = async (query: string) => ndjson((await eventsBody(`/api/v1/events/export?${query}`)).body);

    expect((await run('project=otro'))[0].export).toMatchObject({ total: 1, filters: { project: 'otro' } });
    expect((await run('session_id=session-abcdef123'))[0].export.total).toBe(6);
    expect((await run('event_type=tool.pre&event_type=tool.post'))[0].export).toMatchObject({ total: 3, filters: { event_type: ['tool.pre', 'tool.post'] } });
    expect((await run('tool=Read'))[0].export.total).toBe(1);
    expect((await run('tool=Read&tool=Bash'))[0].export.total).toBe(4);
    // Con el reloj fijo todos los Eventos se reciben en NOW.
    expect((await run(`since=${NOW.toISOString()}`))[0].export.total).toBe(7);
    expect((await run(`since=${new Date(NOW.getTime() + 1000).toISOString()}`))[0].export.total).toBe(0);
  });

  it('sin coincidencias responde 200 con solo la cabecera y total 0', async () => {
    await start();
    await seedSession();
    const res = await eventsBody('/api/v1/events/export?project=nadie');
    expect(res.statusCode).toBe(200);
    const lines = ndjson(res.body);
    expect(lines).toHaveLength(1);
    expect(lines[0].export).toMatchObject({ total: 0, exported: 0, truncated: false, omitted: 0 });
  });

  it('un filtro inválido responde 400', async () => {
    await start();
    for (const query of ['event_type=inventado', 'since=ayer', 'project=', 'tool=', 'limit=5']) {
      expect((await eventsBody(`/api/v1/events/export?${query}`)).statusCode, query).toBe(400);
    }
  });

  it('el filtro tool no rompe el listado de Eventos existente', async () => {
    await start();
    await seedSession();
    expect((await eventsBody('/api/v1/events?limit=3')).json().items).toHaveLength(3);
  });
});

describe('AC-145: tope y vista previa', () => {
  it('con más Eventos que el tope inyectado salen los más recientes y la cabecera lo dice', async () => {
    await start(2);
    await seedSession();

    const [head, ...events] = ndjson((await eventsBody('/api/v1/events/export')).body);

    expect(head.export).toMatchObject({ total: 6, exported: 2, truncated: true, omitted: 4 });
    expect(events.map((e) => e.event_type)).toStrictEqual(['tool.blocked', 'turn.ended']);
  });

  it('el tope aplica también a la Descarga de Sesión, en su bloque export', async () => {
    await start(3);
    await seedSession();

    const body = (await eventsBody('/api/v1/sessions/session-abcdef123/export')).json();

    expect(body.export).toMatchObject({ total: 6, exported: 3, truncated: true, omitted: 3 });
    expect(body.events.map((e: any) => e.event_type)).toStrictEqual(['tool.post', 'tool.blocked', 'turn.ended']);
  });

  it('la descarga larga se lee por lotes: 1 200 Eventos salen completos y en orden', async () => {
    await start();
    for (let i = 0; i < 1200; i += 1) await ingest('tool.pre', new Date(NOW.getTime() - 1_000_000 + i), { tool: 'Bash' });

    const lines = ndjson((await eventsBody('/api/v1/events/export')).body);

    expect(lines[0].export).toMatchObject({ total: 1200, exported: 1200 });
    expect(lines).toHaveLength(1201);
    expect(new Set(lines.slice(1).map((l) => l.id)).size).toBe(1200);
  });

  it('la vista previa de Eventos da recuento, truncado y campos según content', async () => {
    await start(4);
    await seedSession();

    const plain = (await eventsBody('/api/v1/events/export/preview?event_type=tool.pre&event_type=tool.post&event_type=turn.ended')).json();
    expect(plain).toMatchObject({ total: 3, exported: 3, truncated: false, omitted: 0 });
    expect(plain.fields).not.toContain('payload');

    const full = (await eventsBody('/api/v1/events/export/preview?content=true')).json();
    expect(full).toMatchObject({ total: 6, exported: 4, truncated: true, omitted: 2 });
    expect(full.fields).toEqual(expect.arrayContaining(['payload', 'block.reason']));
  });

  it('la vista previa de la Sesión da el mismo recuento y no descarga nada', async () => {
    await start(5);
    await seedSession();

    const res = await eventsBody('/api/v1/sessions/session-abcdef123/export/preview');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(res.json()).toMatchObject({ total: 6, exported: 5, truncated: true, omitted: 1 });
  });
});
