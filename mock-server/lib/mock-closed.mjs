// ¿Está Cerrada una Sesión? Como `isClosed` de `backend/src/domain/session-summary.ts`: su último
// `session.ended` no puede ir seguido de Eventos de una Sesión viva, porque `claude --resume` y
// `--continue` reutilizan el `session_id` y la retoman.
const REOPENS = new Set(['session.started', 'prompt.submitted', 'tool.pre', 'tool.post', 'tool.blocked']);

/** @param {Array<{ event_type: string }>} events En orden de llegada. */
export function isClosed(events) {
  const lastEnd = events.findLastIndex((e) => e.event_type === 'session.ended');
  return lastEnd !== -1 && !events.slice(lastEnd + 1).some((e) => REOPENS.has(e.event_type));
}
