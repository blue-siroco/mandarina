// Actividad Esperando en el mock (ADR-0011, AC-93). Réplica de las reglas de
// `backend/src/domain/waiting.ts` sobre los Eventos en memoria (payload nativo del hook).

export const MAIN = 'main';
const QUESTION_TOOL = 'AskUserQuestion';
const MAX_TEXT = 200;
const MAX_SUMMARY = 80;

// Eventos tras los que no hay Turno en curso.
const IDLE_AFTER = new Set(['session.started', 'turn.ended']);
// Solo avisan: no cuentan como avance del Turno.
export const WAIT_EVENTS = new Set(['permission.requested', 'session.notified']);
const ENDS_ALL = new Set(['prompt.submitted', 'turn.ended', 'session.ended', 'session.started']);
const ENDS_LANE = new Set(['tool.post', 'tool.blocked', 'tool.pre', 'subagent.stopped']);

// Campo más representativo de cada herramienta (como `tool-summary.ts` del backend).
const MAIN_FIELD = {
  Bash: 'command', Read: 'file_path', Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path', Grep: 'pattern', Glob: 'pattern', WebFetch: 'url', WebSearch: 'query',
  Task: 'description', Agent: 'description', Skill: 'skill',
};

const firstLine = (t, max) => {
  const line = t.split('\n')[0].trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};
const oneLine = (t) => (typeof t === 'string' && t.trim() !== '' ? firstLine(t, MAX_TEXT) : null);

function summarizeToolInput(toolName, input) {
  if (!input || typeof input !== 'object') return null;
  const preferred = toolName ? input[MAIN_FIELD[toolName]] : undefined;
  if (typeof preferred === 'string' && preferred.trim() !== '') return firstLine(preferred, MAX_SUMMARY);
  const fallback = Object.values(input).find((v) => typeof v === 'string' && v.trim() !== '');
  return fallback ? firstLine(fallback, MAX_SUMMARY) : null;
}

export function notificationReason(payload) {
  const type = typeof payload?.notification_type === 'string' ? payload.notification_type.trim() : '';
  if (type) return type === 'permission_prompt' ? 'permission' : type === 'idle_prompt' ? 'idle' : null;
  const message = typeof payload?.message === 'string' ? payload.message.toLowerCase() : '';
  const permission = message.includes('permission');
  const idle = message.includes('waiting for your input');
  if (permission === idle) return null;
  return permission ? 'permission' : 'idle';
}

/** Esperas vigentes al final de `events` (orden de llegada, una sola Sesión), por inicio. */
export function pendingWaits(events) {
  let waits = [];
  let turnOpen = false;
  for (const e of events) {
    const lane = e.subagent_id ?? MAIN;
    const type = e.event_type;
    if (ENDS_ALL.has(type)) waits = [];
    else if (ENDS_LANE.has(type)) waits = waits.filter((w) => w.lane !== null && w.lane !== lane);
    if (!WAIT_EVENTS.has(type) || type === 'permission.requested') waits = waits.filter((w) => w.reason !== 'idle');

    if (type === 'permission.requested') {
      const pending = waits.find((w) => w.reason === 'question' && w.lane === lane);
      const permission = waits.find((w) => w.reason === 'permission' && (w.lane === lane || w.tool === null));
      if (pending) continue;
      const tool = e.tool_name ?? null;
      const summary = summarizeToolInput(tool, e.payload?.tool_input);
      if (permission) {
        if (permission.tool === null && tool !== null) Object.assign(permission, { tool, summary, lane, subagent_id: e.subagent_id, event_id: e.id });
        continue;
      }
      waits.push({ since: e.occurred_at, reason: 'permission', tool, summary, lane, subagent_id: e.subagent_id, event_id: e.id });
    } else if (type === 'session.notified') {
      const reason = notificationReason(e.payload);
      if (reason === 'permission') {
        if (!waits.some((w) => w.reason === 'permission' || w.reason === 'question')) {
          waits.push({ since: e.occurred_at, reason, tool: null, summary: oneLine(e.payload?.message), lane: MAIN, subagent_id: null, event_id: e.id });
        }
      } else if (reason === 'idle' && turnOpen && !waits.some((w) => w.reason === 'idle')) {
        waits.push({ since: e.occurred_at, reason, tool: null, summary: oneLine(e.payload?.message), lane: null, subagent_id: null, event_id: e.id });
      }
    } else if (type === 'tool.pre' && e.tool_name === QUESTION_TOOL) {
      waits.push({ since: e.occurred_at, reason: 'question', tool: QUESTION_TOOL, summary: oneLine(e.payload?.tool_input?.questions?.[0]?.question), lane, subagent_id: e.subagent_id, event_id: e.id });
    }
    if (!WAIT_EVENTS.has(type)) turnOpen = !IDLE_AFTER.has(type);
  }
  return turnOpen ? waits : [];
}

/** La espera que se muestra (la más antigua) o `null`. */
export const currentWait = (events) => pendingWaits(events)[0] ?? null;

/** Último Evento que sí es avance del Turno: decide Trabajando/En pausa aunque haya avisos después. */
export const lastProgress = (events) => events.findLast((e) => !WAIT_EVENTS.has(e.event_type));

/** Forma del contrato `SessionSummary.waiting`; `lives` son los Subagentes no internos. */
export function toWaitingView(wait, lives) {
  const life = wait.subagent_id === null ? undefined : lives.find((l) => l.subagent_id === wait.subagent_id);
  return {
    since: wait.since,
    reason: wait.reason,
    tool: wait.tool,
    summary: wait.summary,
    subagent: life ? { id: life.subagent_id, type: life.agent_type } : null,
  };
}
