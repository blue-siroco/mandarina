import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// AC-80: el hook consulta el estado de los Presupuestos y para al agente (ADR-0010).

const script = fileURLToPath(new URL('../send_event.mjs', import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const REASON = 'Presupuesto por Sesión superado: ~$9,50 de ~$5,00. Amplía el límite o permite seguir en Mandarina (/presupuestos).';
const STOP = { stop: { budget_id: 'b1', scope: 'session', reason: REASON, spent_usd: 9.5, limit_usd: 5 }, checked_at: '2026-09-25T12:00:00.000Z' };
const GO = { stop: null, checked_at: '2026-09-25T12:00:00.000Z' };

function runHook(stdin, env) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [script], { env: { ...process.env, ...env } });
    let stdout = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.on('exit', (code) => resolve({ code, stdout, elapsed: Date.now() - started }));
    child.stdin.end(JSON.stringify(stdin));
  });
}

/** Servidor simulado que apunta las peticiones al estado del presupuesto y los Eventos recibidos. */
async function mandarina(statusResponse) {
  const seen = { status: [], events: [] };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      if (req.method === 'GET' && req.url.startsWith('/api/v1/budgets/status')) {
        seen.status.push(new URL(req.url, 'http://x'));
        return statusResponse(res);
      }
      seen.events.push(JSON.parse(body));
      res.writeHead(202).end('{"id":"1"}');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const close = () => {
    server.closeAllConnections();
    server.close();
  };
  return { seen, url, close };
}

const json = (body) => (res) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
const env = (url) => ({ MANDARINA_URL: url, MANDARINA_PROJECT: 'demo' });

test('AC-80: un PreToolUse con el Presupuesto superado para al agente y registra el Bloqueo budget', async () => {
  const server = await mandarina(json(STOP));
  const result = await runHook(fixture('PreToolUse'), env(server.url));
  server.close();

  assert.equal(result.code, 0);
  const lines = result.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), { continue: false, stopReason: REASON });
  assert.equal(server.seen.status[0].searchParams.get('session_id'), fixture('PreToolUse').session_id);
  assert.equal(server.seen.status[0].searchParams.get('project'), 'demo');
  const [event] = server.seen.events;
  assert.equal(event.event_type, 'tool.blocked');
  assert.equal(event.native_event_type, 'PreToolUse');
  assert.deepEqual(event.block, { rule: 'budget', reason: REASON });
  assert.equal(event.tool_name, 'Bash');
});

test('AC-80: un UserPromptSubmit con el Presupuesto superado rechaza el prompt y registra el Bloqueo', async () => {
  const server = await mandarina(json(STOP));
  const result = await runHook(fixture('UserPromptSubmit'), env(server.url));
  server.close();

  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { decision: 'block', reason: REASON });
  const [event] = server.seen.events;
  assert.equal(event.event_type, 'tool.blocked');
  assert.equal(event.native_event_type, 'UserPromptSubmit');
  assert.deepEqual(event.block, { rule: 'budget', reason: REASON });
  assert.equal(event.tool_name, null);
  assert.equal(event.payload.prompt, fixture('UserPromptSubmit').prompt);
});

test('AC-80: sin nada que parar sigue el camino normal y no escribe en stdout', async () => {
  const server = await mandarina(json(GO));
  const pre = await runHook(fixture('PreToolUse'), env(server.url));
  const prompt = await runHook(fixture('UserPromptSubmit'), env(server.url));
  server.close();

  assert.equal(pre.stdout, '');
  assert.equal(prompt.stdout, '');
  assert.deepEqual(server.seen.events.map((e) => e.event_type), ['tool.pre', 'prompt.submitted']);
  assert.equal(server.seen.events.every((e) => !('block' in e)), true);
});

test('AC-80: solo PreToolUse y UserPromptSubmit consultan el presupuesto', async () => {
  const server = await mandarina(json(STOP));
  for (const name of ['PostToolUse', 'PostToolUseFailure', 'SessionStart', 'Stop', 'SubagentStop', 'SessionEnd']) {
    const result = await runHook(fixture(name), env(server.url));
    assert.equal(result.stdout, '', name);
  }
  server.close();
  assert.equal(server.seen.status.length, 0);
  assert.equal(server.seen.events.every((e) => e.event_type !== 'tool.blocked'), true);
});

test('AC-80: falla abierto si el servidor no responde a tiempo', async () => {
  const server = await mandarina(() => {}); // el estado nunca responde
  const result = await runHook(fixture('PreToolUse'), env(server.url));
  server.close();

  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.ok(result.elapsed < 3000, `tardó ${result.elapsed} ms`);
  assert.equal(server.seen.status.length, 1);
  assert.deepEqual(server.seen.events.map((e) => e.event_type), ['tool.pre']);
});

test('AC-80: falla abierto con Mandarina apagado', async () => {
  const server = await mandarina(json(GO));
  server.close();
  await new Promise((r) => setTimeout(r, 50));
  const result = await runHook(fixture('PreToolUse'), env(server.url));

  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.ok(result.elapsed < 3000, `tardó ${result.elapsed} ms`);
});

test('AC-80: falla abierto con una respuesta que no se entiende', async () => {
  for (const respond of [
    (res) => res.writeHead(200).end('esto no es json'),
    (res) => res.writeHead(500).end('{"message":"caído"}'),
    json({ stop: { reason: 42 } }),
    json({ stop: {} }),
    json('parar'),
    json(null),
  ]) {
    const server = await mandarina(respond);
    const result = await runHook(fixture('PreToolUse'), env(server.url));
    server.close();
    assert.equal(result.stdout, '');
    assert.equal(server.seen.events[0].event_type, 'tool.pre');
  }
});

test('AC-80: si una Regla de bloqueo ya denegó, no consulta el presupuesto ni envía un segundo Bloqueo', async () => {
  const server = await mandarina(json(STOP));
  const result = await runHook(fixture('PreToolUse-blocked'), env(server.url));
  server.close();

  assert.equal(server.seen.status.length, 0);
  const lines = result.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(server.seen.events.length, 1);
  assert.equal(server.seen.events[0].block.rule, 'dangerous-rm');
});

test('AC-80: el motivo del Bloqueo no lleva secretos del prompt y el Evento sale enmascarado', async () => {
  const server = await mandarina(json(STOP));
  const prompt = { ...fixture('UserPromptSubmit'), prompt: 'usa ana@example.com y la clave sk-ant-api03-abcdefghijklmnop' };
  await runHook(prompt, env(server.url));
  server.close();
  const [event] = server.seen.events;
  assert.equal(event.payload.prompt, 'usa [REDACTED_EMAIL] y la clave [REDACTED_API_KEY]');
});
