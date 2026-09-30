import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readingFromStatusLine } from '../lib/statusline.mjs';

const script = fileURLToPath(new URL('../statusline.mjs', import.meta.url));
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');

function runStatusLine(stdin, env) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [script], { env: { ...process.env, MANDARINA_STATUSLINE_CHAIN: '', ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('exit', (code) => resolve({ code, stdout, stderr, elapsed: Date.now() - started }));
    child.stdin.end(stdin);
  });
}

function listen(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/** Servidor que guarda cada petición recibida y responde 204. */
async function recorder() {
  const received = [];
  const server = await listen((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, body: body === '' ? null : JSON.parse(body) });
      res.writeHead(204).end();
    });
  });
  return { received, server, url: `http://127.0.0.1:${server.address().port}` };
}

test('AC-127: extrae las dos ventanas y el session_id', () => {
  const reading = readingFromStatusLine(JSON.parse(fixture('statusline-subscription')));
  assert.deepEqual(reading, {
    session_id: '7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33',
    five_hour: { used_percentage: 23.5, resets_at: 1790000000 },
    seven_day: { used_percentage: 41.2, resets_at: 1790400000 },
  });
});

test('AC-127: cada ventana es independiente', () => {
  const only = readingFromStatusLine(JSON.parse(fixture('statusline-five-hour-only')));
  assert.deepEqual(Object.keys(only).sort(), ['five_hour', 'session_id']);

  const broken = readingFromStatusLine({
    rate_limits: { five_hour: { used_percentage: 'mucho', resets_at: 1790000000 }, seven_day: { used_percentage: 10, resets_at: 1790400000 } },
  });
  assert.deepEqual(broken, { seven_day: { used_percentage: 10, resets_at: 1790400000 } });
});

test('AC-127: sin rate_limits o sin ventana válida no hay lectura', () => {
  assert.equal(readingFromStatusLine(JSON.parse(fixture('statusline-no-rate-limits'))), null);
  assert.equal(readingFromStatusLine({ rate_limits: {} }), null);
  assert.equal(readingFromStatusLine({ rate_limits: { five_hour: { used_percentage: 5 } } }), null);
  assert.equal(readingFromStatusLine({ rate_limits: { five_hour: null, seven_day: 'x' } }), null);
  assert.equal(readingFromStatusLine(null), null);
  assert.equal(readingFromStatusLine('texto'), null);
});

test('AC-127: acota el porcentaje a 0..100 y redondea resets_at a entero', () => {
  const reading = readingFromStatusLine({ rate_limits: { five_hour: { used_percentage: 100.4, resets_at: 1790000000.7 } } });
  assert.deepEqual(reading, { five_hour: { used_percentage: 100, resets_at: 1790000001 } });
  assert.equal(readingFromStatusLine({ rate_limits: { five_hour: { used_percentage: -3, resets_at: 1790000000 } } }).five_hour.used_percentage, 0);
});

test('AC-127: session_id solo si es texto no vacío', () => {
  const rate_limits = { five_hour: { used_percentage: 5, resets_at: 1790000000 } };
  assert.equal('session_id' in readingFromStatusLine({ session_id: '', rate_limits }), false);
  assert.equal('session_id' in readingFromStatusLine({ session_id: 7, rate_limits }), false);
});

test('AC-127: envía la lectura por PUT /api/v1/subscription-usage', async () => {
  const { received, server, url } = await recorder();
  const result = await runStatusLine(fixture('statusline-subscription'), { MANDARINA_URL: url });
  server.close();

  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.equal(received.length, 1);
  assert.equal(received[0].method, 'PUT');
  assert.equal(received[0].url, '/api/v1/subscription-usage');
  assert.equal(received[0].body.five_hour.used_percentage, 23.5);
  assert.equal(received[0].body.seven_day.resets_at, 1790400000);
  assert.equal(received[0].body.session_id, '7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33');
});

test('AC-127: acepta stdin con BOM', async () => {
  const { received, server, url } = await recorder();
  const result = await runStatusLine(`﻿${fixture('statusline-five-hour-only')}`, { MANDARINA_URL: url });
  server.close();
  assert.equal(result.code, 0);
  assert.equal(received.length, 1);
});

test('AC-127: sin rate_limits, malformado o vacío no envía nada y sale con 0', async () => {
  const { received, server, url } = await recorder();
  for (const stdin of [fixture('statusline-no-rate-limits'), '{no es json', '']) {
    const result = await runStatusLine(stdin, { MANDARINA_URL: url });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, '');
  }
  server.close();
  assert.equal(received.length, 0);
});

test('AC-127: con Mandarina caído sale con 0 sin escribir errores', async () => {
  const result = await runStatusLine(fixture('statusline-subscription'), { MANDARINA_URL: 'http://127.0.0.1:1' });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

// Comando de cadena portable: usa el mismo node que los tests.
const chainCommand = (code) => `"${process.execPath}" -e "${code}"`;

test('AC-128: reenvía la salida de la cadena y le pasa el mismo stdin', async () => {
  const { received, server, url } = await recorder();
  const chain = chainCommand(
    "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);process.stdout.write('modelo:'+j.model.display_name)})",
  );
  const result = await runStatusLine(fixture('statusline-subscription'), { MANDARINA_URL: url, MANDARINA_STATUSLINE_CHAIN: chain });
  server.close();

  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'modelo:Sonnet 5');
  assert.equal(received.length, 1);
});

test('AC-128: reenvía también el stderr de la cadena', async () => {
  const chain = chainCommand("process.stderr.write('aviso')");
  const result = await runStatusLine(fixture('statusline-no-rate-limits'), { MANDARINA_URL: 'http://127.0.0.1:1', MANDARINA_STATUSLINE_CHAIN: chain });
  assert.equal(result.stderr, 'aviso');
});

test('AC-128: un servidor que no responde no retrasa más allá del tope', async () => {
  const server = await listen(() => {
    /* no responde nunca */
  });
  const chain = chainCommand("process.stdout.write('ok')");
  const result = await runStatusLine(fixture('statusline-subscription'), {
    MANDARINA_URL: `http://127.0.0.1:${server.address().port}`,
    MANDARINA_STATUSLINE_CHAIN: chain,
  });
  server.closeAllConnections();
  server.close();

  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'ok');
  assert.ok(result.elapsed < 3000, `tardó ${result.elapsed} ms`);
});

test('AC-128: una cadena que falla no impide el envío ni rompe el Adaptador', async () => {
  const { received, server, url } = await recorder();
  const result = await runStatusLine(fixture('statusline-subscription'), {
    MANDARINA_URL: url,
    MANDARINA_STATUSLINE_CHAIN: chainCommand('process.exit(3)'),
  });
  server.close();
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.equal(received.length, 1);
});

test('AC-128: con JSON malformado la cadena se ejecuta igual con el stdin original', async () => {
  const chain = chainCommand("let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write('eco:'+s))");
  const result = await runStatusLine('{roto', { MANDARINA_URL: 'http://127.0.0.1:1', MANDARINA_STATUSLINE_CHAIN: chain });
  assert.equal(result.stdout, 'eco:{roto');
});

test('AC-128: una cadena que no termina se corta por tiempo y el Adaptador sale con 0', async () => {
  const chain = chainCommand('setInterval(()=>{},1000)');
  const result = await runStatusLine(fixture('statusline-no-rate-limits'), {
    MANDARINA_URL: 'http://127.0.0.1:1',
    MANDARINA_STATUSLINE_CHAIN: chain,
    MANDARINA_STATUSLINE_CHAIN_TIMEOUT_MS: '400',
  });
  assert.equal(result.code, 0);
  assert.ok(result.elapsed < 4000, `tardó ${result.elapsed} ms`);
});

test('AC-128: la salida de la cadena tiene tope de tamaño', async () => {
  const chain = chainCommand("process.stdout.write('x'.repeat(500000))");
  const result = await runStatusLine(fixture('statusline-no-rate-limits'), { MANDARINA_URL: 'http://127.0.0.1:1', MANDARINA_STATUSLINE_CHAIN: chain });
  assert.equal(result.code, 0);
  assert.ok(result.stdout.length > 0 && result.stdout.length < 200000, `salida de ${result.stdout.length} bytes`);
});
