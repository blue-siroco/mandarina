// Actividad Esperando de una Sesión (ADR-0011; AC-88..AC-91). Se deriva de los
// Eventos, sin estado propio: una espera empieza con un Evento que pide algo a la
// persona usuaria y termina con el siguiente Evento que demuestra que se resolvió.
import type { EventType } from './event.js';
import { summarizeToolInput } from './tool-summary.js';

export type WaitReason = 'permission' | 'question' | 'idle';

/** Carril del agente principal; el de un Subagente es su `subagent_id`. */
const MAIN = 'main';
const QUESTION_TOOL = 'AskUserQuestion';
const MAX_TEXT = 200;

/**
 * Pistas del payload que necesita la espera. El repositorio las extrae en SQL
 * (sin cargar payloads enteros) y `hintsOf` calcula lo mismo en memoria.
 */
export interface WaitHints {
  /** `notification_type` de un `session.notified`. */
  notification_type?: string | null;
  /** `message` de un `session.notified`, ya enmascarado. */
  wait_message?: string | null;
  /** Campos representativos de `tool_input` de un `permission.requested`. */
  permission_input?: Record<string, unknown> | null;
  /** `tool_input.questions[0].question` de un `tool.pre` de `AskUserQuestion`. */
  wait_question?: string | null;
}

/** Fila mínima que consume la derivación (compatible con `SessionEventRow`). */
export interface WaitRow extends WaitHints {
  event_type: EventType;
  subagent_id: string | null;
  tool_name: string | null;
  occurred_at: string;
  id: string;
}

/** Espera vigente; el Subagente se resuelve fuera (necesita el ciclo de vida). */
export interface Wait {
  since: string;
  reason: WaitReason;
  tool: string | null;
  summary: string | null;
  /** `subagent_id` del carril que espera; `null` si espera el agente principal. */
  subagent_id: string | null;
  event_id: string;
}

// Eventos tras los que no hay Turno en curso (mismo criterio que la Actividad).
const IDLE_AFTER: ReadonlySet<EventType> = new Set(['session.started', 'turn.ended']);
// Eventos que no cuentan como avance del Turno: solo avisan.
const WAIT_EVENTS: ReadonlySet<EventType> = new Set(['permission.requested', 'session.notified']);
// Terminan cualquier espera, sea del carril que sea.
const ENDS_ALL: ReadonlySet<EventType> = new Set(['prompt.submitted', 'turn.ended', 'session.ended', 'session.started']);
// Terminan la espera de permiso/pregunta de su propio carril.
const ENDS_LANE: ReadonlySet<EventType> = new Set(['tool.post', 'tool.blocked', 'tool.pre', 'subagent.stopped']);

const oneLine = (text: string | null | undefined): string | null => {
  const line = text?.split('\n')[0]?.trim();
  if (!line) return null;
  return line.length > MAX_TEXT ? `${line.slice(0, MAX_TEXT - 1)}…` : line;
};

/**
 * Motivo de un `session.notified`. Sin `notification_type` solo se infiere del
 * mensaje si es inequívoco; otros tipos (`auth_success`…) no son una espera.
 */
export function notificationReason(row: Pick<WaitHints, 'notification_type' | 'wait_message'>): 'permission' | 'idle' | null {
  const type = row.notification_type?.trim();
  if (type) return type === 'permission_prompt' ? 'permission' : type === 'idle_prompt' ? 'idle' : null;
  const message = row.wait_message?.toLowerCase() ?? '';
  const permission = message.includes('permission');
  const idle = message.includes('waiting for your input');
  if (permission === idle) return null;
  return permission ? 'permission' : 'idle';
}

const laneOf = (row: { subagent_id: string | null }) => row.subagent_id ?? MAIN;

/**
 * Esperas vigentes al final de `rows` (orden de llegada, una sola Sesión).
 * Una espera solo nace con un Turno en curso; se devuelven por inicio.
 * Exige que el llamador aplique el Estado de la Sesión (Cerrada/Huérfana => sin espera).
 */
export function pendingWaits(rows: readonly WaitRow[]): Wait[] {
  let waits: Array<Wait & { lane: string | null }> = [];
  let turnOpen = false;

  for (const row of rows) {
    const lane = laneOf(row);
    const type = row.event_type;

    if (ENDS_ALL.has(type)) waits = [];
    else if (ENDS_LANE.has(type)) waits = waits.filter((w) => w.lane !== null && w.lane !== lane);
    // La inactividad (Sesión entera parada) termina con cualquier Evento salvo otra notificación.
    if (!WAIT_EVENTS.has(type) || type === 'permission.requested') waits = waits.filter((w) => w.reason !== 'idle');

    if (type === 'permission.requested') {
      const pending = waits.find((w) => w.reason === 'question' && w.lane === lane);
      const permission = waits.find((w) => w.reason === 'permission' && (w.lane === lane || w.tool === null));
      if (pending) continue; // prevalece la pregunta: es la misma espera
      const summary = summarizeToolInput(row.tool_name, { tool_input: row.permission_input ?? null });
      if (permission) {
        // Una notificación de permiso llegó antes: se queda su inicio y se toma el detalle con herramienta.
        if (permission.tool === null && row.tool_name !== null) {
          Object.assign(permission, { tool: row.tool_name, summary, lane, subagent_id: row.subagent_id, event_id: row.id });
        }
        continue;
      }
      waits.push({ since: row.occurred_at, reason: 'permission', tool: row.tool_name, summary, lane, subagent_id: row.subagent_id, event_id: row.id });
    } else if (type === 'session.notified') {
      const reason = notificationReason(row);
      if (reason === 'permission') {
        // Con la espera de permiso ya abierta (o una pregunta abierta) no hay espera nueva.
        const covered = waits.some((w) => w.reason === 'permission' || w.reason === 'question');
        if (!covered) {
          waits.push({ since: row.occurred_at, reason, tool: null, summary: oneLine(row.wait_message), lane, subagent_id: row.subagent_id, event_id: row.id });
        }
      } else if (reason === 'idle' && turnOpen && !waits.some((w) => w.reason === 'idle')) {
        waits.push({ since: row.occurred_at, reason, tool: null, summary: oneLine(row.wait_message), lane: null, subagent_id: null, event_id: row.id });
      }
    } else if (type === 'tool.pre' && row.tool_name === QUESTION_TOOL) {
      waits.push({ since: row.occurred_at, reason: 'question', tool: QUESTION_TOOL, summary: oneLine(row.wait_question), lane, subagent_id: row.subagent_id, event_id: row.id });
    }

    if (!WAIT_EVENTS.has(type)) turnOpen = !IDLE_AFTER.has(type);
  }
  // Una espera sin Turno en curso no existe (p. ej. permiso tras session.started).
  return turnOpen ? waits.map(({ lane: _lane, ...wait }) => wait) : [];
}

/** La espera que se muestra: la más antigua. */
export function currentWait(rows: readonly WaitRow[]): Wait | null {
  return pendingWaits(rows)[0] ?? null;
}
