#!/usr/bin/env node
// Adaptador de Claude Code: lee el JSON del hook por stdin y lo envía a
// Mandarina. Best-effort (ADR-0004): nunca falla y nunca tarda más de
// HARD_LIMIT_MS, para no frenar ni romper a Claude Code. Solo escribe en
// stdout para bloquear un PreToolUse que incumple una Regla de bloqueo (ADR-0006).

import { writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { maskEvent } from './lib/mask.mjs';
import { budgetStopDecision, denyDecision, resolveProject, resolveUrl, toEvent } from './lib/normalize.mjs';
import { evaluate, loadRules } from './lib/rules.mjs';

const REQUEST_TIMEOUT_MS = 1500;
// La consulta del presupuesto va antes de cada herramienta: si no responde enseguida, no detiene nada (ADR-0010).
const BUDGET_TIMEOUT_MS = 500;
const BUDGET_HOOKS = new Set(['PreToolUse', 'UserPromptSubmit']);
const HARD_LIMIT_MS = 2500;

setTimeout(() => process.exit(0), HARD_LIMIT_MS).unref();

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  // PowerShell 5.1 antepone un BOM al canalizar texto (p. ej. en pruebas manuales).
  return Buffer.concat(chunks).toString('utf8').replace(/^﻿/, '');
}

function checkRules(native, env) {
  try {
    const project = resolveProject(env, native.cwd || process.cwd());
    return evaluate(native, { rules: loadRules(env), project, home: homedir() });
  } catch (error) {
    // Un fallo en las reglas no debe dejar a Claude Code sin herramientas ni sin Evento.
    if (env.MANDARINA_DEBUG) process.stderr.write(`mandarina: error evaluando reglas: ${error}\n`);
    return null;
  }
}

/**
 * ¿Hay que parar al agente por un Presupuesto superado? Falla abierto: sin respuesta a
 * tiempo, con un error o con una respuesta que no se entiende, devuelve `null` (ADR-0010).
 */
async function checkBudget(native, env) {
  if (!BUDGET_HOOKS.has(native.hook_event_name)) return null;
  try {
    const project = resolveProject(env, native.cwd || process.cwd());
    const query = new URLSearchParams({ session_id: native.session_id, project });
    const response = await fetch(`${resolveUrl(env)}/api/v1/budgets/status?${query}`, { signal: AbortSignal.timeout(BUDGET_TIMEOUT_MS) });
    if (!response.ok) return null;
    const reason = (await response.json())?.stop?.reason;
    return typeof reason === 'string' && reason !== '' ? { rule: 'budget', reason } : null;
  } catch (error) {
    if (env.MANDARINA_DEBUG) process.stderr.write(`mandarina: error consultando el presupuesto: ${error}\n`);
    return null;
  }
}

async function main() {
  const env = process.env;
  const native = JSON.parse(await readStdin());
  // Primero la decisión, antes de cualquier red: el Bloqueo no puede depender de que Mandarina responda.
  const block = checkRules(native, env);
  // Síncrono para que la decisión llegue entera aunque el proceso salga justo después.
  if (block) writeSync(1, `${JSON.stringify(denyDecision(block))}\n`);
  // Las Reglas mandan: si ya denegaron, no se consulta el presupuesto ni se envía un segundo Bloqueo.
  const overBudget = block ? null : await checkBudget(native, env);
  if (overBudget) writeSync(1, `${JSON.stringify(budgetStopDecision(native.hook_event_name, overBudget.reason))}\n`);
  const event = toEvent(native, { env, now: new Date(), block: block ?? overBudget });
  if (!event) return;
  // El secreto no sale de este proceso (AC-62). Si enmascarar falla, el Evento se descarta antes que enviarlo en claro.
  const masked = maskEvent(event, env);
  await fetch(`${resolveUrl(env)}/api/v1/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(masked),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

main()
  .catch((error) => {
    if (process.env.MANDARINA_DEBUG) process.stderr.write(`mandarina: ${error}\n`);
  })
  .finally(() => process.exit(0));
