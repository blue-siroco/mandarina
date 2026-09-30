// Traduce el JSON nativo de un hook de Claude Code al Evento normalizado de
// Mandarina (ver `spec/mvp-fase1.md` y ADR-0002).

export const SCHEMA_VERSION = 1;
export const HARNESS = 'claude-code';
export const DEFAULT_URL = 'http://127.0.0.1:4000';

const EVENT_TYPES = {
  SessionStart: 'session.started',
  UserPromptSubmit: 'prompt.submitted',
  PreToolUse: 'tool.pre',
  PostToolUse: 'tool.post',
  // Claude Code lo lanza en lugar de PostToolUse cuando la herramienta falla
  // (p. ej. tests en rojo): la invocación terminó igual (ADR-0007).
  PostToolUseFailure: 'tool.post',
  SubagentStart: 'subagent.started',
  SubagentStop: 'subagent.stopped',
  Stop: 'turn.ended',
  SessionEnd: 'session.ended',
  // Hooks de espera (ADR-0011): solo observan. No se evalúan Reglas ni Presupuestos
  // (rules.mjs solo mira PreToolUse; BUDGET_HOOKS no los incluye) y el hook no
  // escribe en stdout, así que no toca el diálogo de permiso de Claude Code.
  PermissionRequest: 'permission.requested',
  Notification: 'session.notified',
};

// El hook corre en el host (Windows, macOS o Linux) pero los tests pueden
// correr en otro SO, así que no se usa `path.basename`, que depende del SO.
function folderName(path) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function resolveProject(env, cwd) {
  if (env.MANDARINA_PROJECT) return env.MANDARINA_PROJECT;
  return folderName(env.CLAUDE_PROJECT_DIR || cwd);
}

export function resolveUrl(env) {
  return (env.MANDARINA_URL || DEFAULT_URL).replace(/\/+$/, '');
}

/**
 * Devuelve el Evento normalizado, o `null` si el hook no es uno de los capturados.
 * Con `block` (resultado de una Regla de bloqueo) un PreToolUse se envía como
 * `tool.blocked` en lugar de `tool.pre` (ADR-0006).
 */
export function toEvent(native, { env, now, block = null }) {
  let eventType = EVENT_TYPES[native.hook_event_name];
  if (!eventType || !native.session_id) return null;
  // Un Bloqueo de Regla o de presupuesto viaja como `tool.blocked`; un prompt solo se bloquea por presupuesto (ADR-0010).
  const blocked = Boolean(block) && (native.hook_event_name === 'PreToolUse' || native.hook_event_name === 'UserPromptSubmit');
  if (blocked) eventType = 'tool.blocked';
  const cwd = native.cwd || process.cwd();
  const event = {
    schema_version: SCHEMA_VERSION,
    harness: HARNESS,
    project: resolveProject(env, cwd),
    directory: cwd,
    session_id: native.session_id,
    subagent_id: native.agent_id ?? null,
    event_type: eventType,
    native_event_type: native.hook_event_name,
    tool_name: native.tool_name ?? null,
    occurred_at: now.toISOString(),
    transcript_path: native.transcript_path ?? null,
    payload: native,
  };
  // `block` solo viaja en `tool.blocked`, para no cambiar el resto de Eventos.
  if (blocked) event.block = { rule: block.rule, reason: block.reason };
  return event;
}

/**
 * Salida de hook que para al agente por un Presupuesto superado (ADR-0010). `continue: false`
 * detiene al agente entero; solo rechazar la herramienta haría que el modelo reintente.
 * Un prompt nuevo se rechaza con `decision: "block"`.
 */
export function budgetStopDecision(hookName, reason) {
  return hookName === 'UserPromptSubmit' ? { decision: 'block', reason } : { continue: false, stopReason: reason };
}

/** Salida de hook que Claude Code interpreta como "no ejecutes esta herramienta". */
export function denyDecision(block) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Mandarina bloqueó esta acción (${block.rule}): ${block.reason}`,
    },
  };
}
