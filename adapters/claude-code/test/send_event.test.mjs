import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../send_event.mjs', import.meta.url));
const fixture = readFileSync(new URL('./fixtures/PreToolUse.json', import.meta.url), 'utf8');

function runHook(stdin, env) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [script], { env: { ...process.env, ...env } });
    let stdout = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.on('exit', (code) => resolve({ code, stdout, elapsed: Date.now() - started }));
    child.stdin.end(stdin);
  });
}

function listen(handler) {
  return new Promise((resolve) => {
    // El hook también consulta el estado del presupuesto (ADR-0010): aquí no hay nada que parar.
    const server = createServer((req, res) => {
      if (req.method === 'GET') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"stop":null}');
      return handler(req, res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('AC-01: envía el Evento normalizado por POST /api/v1/events', async () => {
  let received;
  const server = await listen((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      received = { url: req.url, method: req.method, body: JSON.parse(body) };
      res.writeHead(202).end('{"id":"1"}');
    });
  });
  const { port } = server.address();
  const result = await runHook(fixture, { MANDARINA_URL: `http://127.0.0.1:${port}`, MANDARINA_PROJECT: 'demo' });
  server.close();

  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.equal(received.method, 'POST');
  assert.equal(received.url, '/api/v1/events');
  assert.equal(received.body.event_type, 'tool.pre');
  assert.equal(received.body.project, 'demo');
});

test('AC-01: acepta stdin con BOM', async () => {
  let received;
  const server = await listen((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      received = JSON.parse(body);
      res.writeHead(202).end('{"id":"1"}');
    });
  });
  const { port } = server.address();
  await runHook(`﻿${fixture}`, { MANDARINA_URL: `http://127.0.0.1:${port}` });
  server.close();

  assert.equal(received?.event_type, 'tool.pre');
});

test('AC-02: con el servidor apagado sale con 0, en silencio y rápido', async () => {
  const server = await listen(() => {});
  const { port } = server.address();
  await new Promise((r) => server.close(r));

  const result = await runHook(fixture, { MANDARINA_URL: `http://127.0.0.1:${port}` });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.ok(result.elapsed < 3000, `tardó ${result.elapsed} ms`);
});

test('AC-02: con el servidor colgado sale con 0 en menos de 3 s', async () => {
  const server = await listen(() => {}); // nunca responde
  const { port } = server.address();
  const result = await runHook(fixture, { MANDARINA_URL: `http://127.0.0.1:${port}` });
  server.closeAllConnections();
  server.close();

  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.ok(result.elapsed < 3000, `tardó ${result.elapsed} ms`);
});

const blockedFixture = readFileSync(new URL('./fixtures/PreToolUse-blocked.json', import.meta.url), 'utf8');
const REASON = 'rm -rf sobre "/", fuera del Directorio de la Sesión. Borra solo rutas dentro del proyecto.';
const DENY = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: `Mandarina bloqueó esta acción (dangerous-rm): ${REASON}`,
  },
};

test('AC-20: un PreToolUse bloqueado deniega por stdout y envía tool.blocked con block', async () => {
  let received;
  const server = await listen((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      received = JSON.parse(body);
      res.writeHead(202).end('{"id":"1"}');
    });
  });
  const { port } = server.address();
  const result = await runHook(blockedFixture, { MANDARINA_URL: `http://127.0.0.1:${port}`, MANDARINA_PROJECT: 'demo' });
  server.close();

  assert.equal(result.code, 0);
  const lines = result.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), DENY);
  assert.equal(received.event_type, 'tool.blocked');
  assert.equal(received.native_event_type, 'PreToolUse');
  assert.deepEqual(received.block, { rule: 'dangerous-rm', reason: REASON });
});

test('AC-20: un PreToolUse permitido no lleva block ni escribe en stdout', async () => {
  let received;
  const server = await listen((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      received = JSON.parse(body);
      res.writeHead(202).end('{"id":"1"}');
    });
  });
  const { port } = server.address();
  const result = await runHook(fixture, { MANDARINA_URL: `http://127.0.0.1:${port}` });
  server.close();

  assert.equal(result.stdout, '');
  assert.equal(received.event_type, 'tool.pre');
  assert.equal('block' in received, false);
});

test('AC-20: con el servidor apagado un Bloqueo sigue denegando y sale con 0 rápido', async () => {
  const server = await listen(() => {});
  const { port } = server.address();
  await new Promise((r) => server.close(r));

  const result = await runHook(blockedFixture, { MANDARINA_URL: `http://127.0.0.1:${port}` });
  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), DENY);
  assert.ok(result.elapsed < 3000, `tardó ${result.elapsed} ms`);
});

test('AC-20: con el servidor colgado un Bloqueo deniega y sale con 0 en menos de 3 s', async () => {
  const server = await listen(() => {}); // nunca responde
  const { port } = server.address();
  const result = await runHook(blockedFixture, { MANDARINA_URL: `http://127.0.0.1:${port}` });
  server.closeAllConnections();
  server.close();

  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), DENY);
  assert.ok(result.elapsed < 3000, `tardó ${result.elapsed} ms`);
});

test('AC-20: una regla desactivada en MANDARINA_RULES deja pasar la invocación', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mandarina-hook-'));
  const rules = join(dir, 'rules.json');
  writeFileSync(rules, JSON.stringify({ rules: {}, projects: { demo: { disabled: ['dangerous-rm'] } } }));
  const result = await runHook(blockedFixture, { MANDARINA_URL: 'http://127.0.0.1:9', MANDARINA_PROJECT: 'demo', MANDARINA_RULES: rules });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
});

const promptFixture = JSON.parse(readFileSync(new URL('./fixtures/UserPromptSubmit.json', import.meta.url), 'utf8'));

async function sendPrompt(prompt, env = {}) {
  let received;
  const server = await listen((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      received = { raw: body, event: JSON.parse(body) };
      res.writeHead(202).end('{"id":"1"}');
    });
  });
  const { port } = server.address();
  const result = await runHook(JSON.stringify({ ...promptFixture, prompt }), { MANDARINA_URL: `http://127.0.0.1:${port}`, ...env });
  server.close();
  return { result, received };
}

test('AC-62: el Evento sale enmascarado del proceso del hook', async () => {
  const { result, received } = await sendPrompt('usa la clave sk-ant-api03-abcdefghijklmnop y escribe a ana@example.com');

  assert.equal(result.code, 0);
  assert.equal(received.raw.includes('sk-ant-api03'), false);
  assert.equal(received.raw.includes('ana@example.com'), false);
  assert.equal(received.event.payload.prompt, 'usa la clave [REDACTED_API_KEY] y escribe a [REDACTED_EMAIL]');
  assert.equal(received.event.session_id, promptFixture.session_id);
});

test('AC-62: MANDARINA_MASK_PII=none deja los datos personales y sigue tapando los secretos', async () => {
  const { received } = await sendPrompt('ana@example.com sk-ant-api03-abcdefghijklmnop', { MANDARINA_MASK_PII: 'none' });
  assert.equal(received.event.payload.prompt, 'ana@example.com [REDACTED_API_KEY]');
});

test('AC-02: con stdin inválido sale con 0 en silencio', async () => {
  const result = await runHook('esto no es json', { MANDARINA_URL: 'http://127.0.0.1:9' });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
});
