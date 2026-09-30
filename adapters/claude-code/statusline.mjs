#!/usr/bin/env node
// Adaptador de Claude Code como comando de `statusLine` (ADR-0012): lee el JSON
// que Claude Code pasa por stdin y envía a Mandarina la cuota de la suscripción
// (`rate_limits`). Una persona solo tiene una `statusLine`, así que, si ya tenía
// otra, se encadena con MANDARINA_STATUSLINE_CHAIN: se ejecuta con el mismo stdin
// y su salida es la nuestra. Sin cadena no imprime nada.
// Best-effort como el hook (ADR-0004): nunca lanza, sale siempre con 0 y el envío
// no espera más de REQUEST_TIMEOUT_MS, ni antes ni después de la cadena.

import { spawn } from 'node:child_process';
import { writeSync } from 'node:fs';
import { resolveUrl } from './lib/normalize.mjs';
import { readingFromStatusLine } from './lib/statusline.mjs';

const REQUEST_TIMEOUT_MS = 1500;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  // PowerShell 5.1 antepone un BOM al canalizar texto (p. ej. en pruebas manuales).
  return Buffer.concat(chunks).toString('utf8').replace(/^﻿/, '');
}

function parse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Envía la lectura sin lanzar nunca: un fallo aquí solo pierde esa lectura. */
async function send(reading, env) {
  try {
    await fetch(`${resolveUrl(env)}/api/v1/subscription-usage`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(reading),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (env.MANDARINA_DEBUG) process.stderr.write(`mandarina: error enviando el uso de la suscripción: ${error}\n`);
  }
}

/** Tope de la cadena: una `statusLine` colgada no debe dejar procesos huérfanos ni memoria sin límite. */
const CHAIN_TIMEOUT_MS = 5000;
const CHAIN_MAX_BYTES = 64 * 1024;

/** Ejecuta la `statusLine` previa con el mismo stdin; resuelve con su salida (vacía si falla). */
function runChain(command, input, timeoutMs = CHAIN_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const out = { stdout: '', stderr: '' };
    let child;
    try {
      child = spawn(command, { shell: true, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch {
      return resolve(out);
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(out);
    };
    // Con `shell: true` matar solo la shell dejaría vivo al proceso hijo (y sus pipes abiertos): se mata el árbol y no se espera al `close`.
    const timer = setTimeout(() => {
      killTree(child);
      finish();
    }, timeoutMs);
    const append = (key) => (d) => {
      if (out[key].length < CHAIN_MAX_BYTES) out[key] += d;
    };
    child.stdout.on('data', append('stdout'));
    child.stderr.on('data', append('stderr'));
    child.on('error', finish);
    child.on('close', finish);
    // Si la cadena no lee su stdin, el pipe se cierra y da EPIPE: no es un error nuestro.
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

function killTree(child) {
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else child.kill('SIGKILL');
  } catch {
    /* si no se puede matar, se sale igualmente: el Adaptador nunca bloquea */
  }
}

function emit(fd, text) {
  if (text === '') return;
  try {
    // Síncrono para que la salida llegue entera aunque el proceso termine justo después.
    writeSync(fd, text);
  } catch {
    /* la salida cerrada no debe romper a Claude Code */
  }
}

async function main() {
  const env = process.env;
  const raw = await readStdin();
  const reading = readingFromStatusLine(parse(raw));
  // El envío y la cadena corren a la vez: la salida no espera al servidor más que el tope.
  const sending = reading ? send(reading, env) : Promise.resolve();
  const chain = env.MANDARINA_STATUSLINE_CHAIN?.trim();
  if (chain) {
    const out = await runChain(chain, raw, Number(env.MANDARINA_STATUSLINE_CHAIN_TIMEOUT_MS) || CHAIN_TIMEOUT_MS);
    emit(1, out.stdout);
    emit(2, out.stderr);
  }
  await sending;
}

main()
  .catch((error) => {
    if (process.env.MANDARINA_DEBUG) process.stderr.write(`mandarina: ${error}\n`);
  })
  .finally(() => process.exit(0));
