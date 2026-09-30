// Redacción del detalle de Sesión para la Descarga de Sesión (ADR-0013; AC-142, AC-143).
// Es genérica sobre el detalle para que el dominio no dependa del caso de uso que lo arma.

import { maskSecrets } from './mask-secrets.js';

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);

function without(source: Json, ...keys: string[]): Json {
  const copy = { ...source };
  for (const key of keys) delete copy[key];
  return copy;
}

// Las herramientas en curso y la espera resumen el comando o la entrada de la herramienta: también son contenido.
function stripCurrentTool(tool: unknown): unknown {
  return isObject(tool) ? without(tool, 'summary') : tool;
}

/**
 * Sin contenido quita las claves (no las deja vacías) que llevan prompts, respuestas y
 * entradas de herramientas; con él lo deja todo, pasado por el enmascarado, incluido lo
 * leído del Transcript.
 */
export function redactSessionDetail<T extends object>(detail: T, includeContent: boolean): T {
  if (includeContent) return maskSecrets(detail);
  const source = detail as Json;
  const list = (key: string): Json[] => (Array.isArray(source[key]) ? (source[key] as unknown[]).filter(isObject) : []);
  const result: Json = { ...source };
  result.turns = list('turns').map((turn) => without(turn, 'prompt'));
  result.subagents = list('subagents').map((subagent) => {
    const rest = without(subagent, 'task', 'result');
    if (Array.isArray(rest.tools)) rest.tools = rest.tools.map((tool) => (isObject(tool) ? without(tool, 'summary') : tool));
    return rest;
  });
  result.blocks = list('blocks').map((block) => without(block, 'summary'));
  result.current_tool = stripCurrentTool(source.current_tool);
  if (isObject(source.waiting)) result.waiting = without(source.waiting, 'summary');
  if (Array.isArray(source.live_subagents)) {
    result.live_subagents = source.live_subagents.map((live) =>
      isObject(live) ? { ...without(live, 'description'), current_tool: stripCurrentTool(live.current_tool) } : live,
    );
  }
  return result as T;
}
