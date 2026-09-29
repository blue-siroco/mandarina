// Resumen de una Sesión a partir de sus Eventos: Estado, Actividad, Turnos y
// duraciones (ver `CONTEXT.md` y `spec/mvp-fase1.md` § Sesiones; AC-14).
import type { EventType } from './event.js';
import { ORPHAN_AFTER_MS } from './session-activity.js';
import { subagentLives, type SubagentLife } from './subagent-lifecycle.js';

/** Umbral de Activa de `spec/mvp-fase1.md`. */
export const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
export const SPARKLINE_BUCKETS = 12;
export const SPARKLINE_BUCKET_MS = 5 * 60 * 1000;

export type SessionState = 'active' | 'idle' | 'orphaned' | 'closed';
export type SessionActivity = 'working' | 'paused';

/**
 * Datos del payload que necesita el ciclo de vida de los Subagentes (AC-33).
 * El repositorio los extrae en SQL para no cargar payloads enteros.
 */
export interface SubagentHints {
  /** `agent_type` de `subagent.*`. */
  agent_type?: string | null;
  tool_use_id?: string | null;
  /** `tool_input.subagent_type` de un lanzamiento (`tool.pre` de `Agent`/`Task`). */
  launch_type?: string | null;
  /** `tool_input.description` de un lanzamiento. */
  launch_description?: string | null;
  /** `tool_response.agentId` del `tool.post` de `Agent`/`Task`. */
  launched_agent_id?: string | null;
  /** `tool_response.status` del `tool.post` de `Agent`/`Task` (`async_launched`…). */
  response_status?: string | null;
  /** `tool_input.run_in_background` de un lanzamiento (AC-45). */
  launch_background?: boolean | null;
  /** `tool.post` de una herramienta que falló, sin contar las interrupciones (AC-45). */
  tool_error?: boolean | null;
  /** `tool_input.skill` de un `tool.pre` de `Skill` (AC-45). */
  skill_name?: string | null;
  /** `agent_type` de un Evento del agente principal: la Sesión arrancó como ese agente (AC-45). */
  session_agent_type?: string | null;
}

/** Evento sin `payload`: lo mínimo para resumir muchas Sesiones a la vez. */
export interface SessionEventRow extends SubagentHints {
  id: string;
  session_id: string;
  project: string;
  directory: string;
  harness: string;
  subagent_id: string | null;
  event_type: EventType;
  tool_name: string | null;
  occurred_at: string;
  received_at: string;
  transcript_path: string | null;
}

export interface Turn {
  index: number;
  prompt_event_id: string;
  started_at: string;
  /** `null` si el Turno sigue en curso. */
  ended_at: string | null;
  duration_ms: number;
  tool_count: number;
}

export interface SessionCore {
  session_id: string;
  project: string;
  directory: string;
  harness: string;
  transcript_path: string | null;
  state: SessionState;
  /** Solo para Sesiones que no están Cerradas ni Huérfanas. */
  activity: SessionActivity | null;
  /** Último `tool.pre` sin su `tool.post`, en cualquier carril. */
  open_tool_event_id: string | null;
  /** `tool.pre` abierto de cada carril (`main` o id de Subagente). */
  open_tools: Record<string, string>;
  /** Subagentes de la Sesión sin los internos, por inicio (AC-33). */
  subagents: SubagentLife[];
  /** Subagentes en marcha, incluidos los lanzamientos pendientes, en orden de inicio. */
  running_subagents_list: SubagentLife[];
  started_at: string;
  last_event_at: string;
  last_activity_at: string;
  event_count: number;
  tool_count: number;
  prompt_count: number;
  subagent_count: number;
  running_subagents: number;
  block_count: number;
  turns: Turn[];
  active_duration_ms: number;
  clock_duration_ms: number;
  /** Eventos por intervalo de 5 min en la última hora, el último es el más reciente. */
  sparkline: number[];
}

// Tras estos Eventos no hay Turno en curso: la Sesión espera un prompt.
const IDLE_AFTER: ReadonlySet<EventType> = new Set(['session.started', 'turn.ended']);

const ms = (iso: string) => Date.parse(iso);

function buildTurns(rows: SessionEventRow[]): Turn[] {
  const turns: Turn[] = [];
  let open: { row: SessionEventRow; tools: number } | undefined;
  const close = (endedAt: string | null, lastAt: string) => {
    if (!open) return;
    const end = endedAt ?? lastAt;
    turns.push({
      index: turns.length + 1,
      prompt_event_id: open.row.id,
      started_at: open.row.occurred_at,
      ended_at: endedAt,
      duration_ms: Math.max(0, ms(end) - ms(open.row.occurred_at)),
      tool_count: open.tools,
    });
    open = undefined;
  };

  for (const row of rows) {
    const main = row.subagent_id === null;
    if (main && row.event_type === 'prompt.submitted') {
      // Un prompt sin `turn.ended` previo cierra el Turno anterior: el hook `Stop` se perdió.
      close(row.occurred_at, row.occurred_at);
      open = { row, tools: 0 };
    } else if (main && row.event_type === 'turn.ended') {
      close(row.occurred_at, row.occurred_at);
    } else if (open && (row.event_type === 'tool.pre' || row.event_type === 'tool.blocked')) {
      open.tools += 1;
    }
  }
  // Un Turno en curso dura, de momento, hasta el último Evento (Duración activa ≤ Duración de reloj).
  const last = rows.at(-1);
  if (open && last) close(null, last.occurred_at);
  return turns;
}

// Eventos que solo puede emitir una Sesión viva. Tras un `session.ended`, `claude --resume` o `--continue`
// reutilizan el `session_id`: la Sesión se retoma y deja de estar Cerrada.
const REOPENS: ReadonlySet<EventType> = new Set(['session.started', 'prompt.submitted', 'tool.pre', 'tool.post', 'tool.blocked']);

/** Cerrada si su último `session.ended` no lo sigue ningún Evento de una Sesión viva. */
function isClosed(rows: SessionEventRow[]): boolean {
  const lastEnd = rows.findLastIndex((r) => r.event_type === 'session.ended');
  return lastEnd !== -1 && !rows.slice(lastEnd + 1).some((r) => REOPENS.has(r.event_type));
}

/** Carril del agente principal en `open_tools`. */
export const MAIN_LANE = 'main';

function openTools(rows: SessionEventRow[]): Map<string, SessionEventRow> {
  // Un carril por agente: el `tool.pre` de un Subagente no lo cierra el `tool.post` de otro.
  const pending = new Map<string, SessionEventRow>();
  for (const row of rows) {
    const lane = row.subagent_id ?? MAIN_LANE;
    if (row.event_type === 'tool.pre') pending.set(lane, row);
    else if (row.event_type === 'tool.post' || row.event_type === 'tool.blocked') pending.delete(lane);
    else if (row.event_type === 'subagent.stopped') pending.delete(lane);
    else if (row.event_type === 'turn.ended' || row.event_type === 'session.ended') pending.clear();
  }
  return pending;
}

function latestOf(rows: Iterable<SessionEventRow>): string | null {
  return [...rows].sort((a, b) => ms(b.received_at) - ms(a.received_at))[0]?.id ?? null;
}

function sparkline(rows: SessionEventRow[], now: Date): number[] {
  const buckets = new Array<number>(SPARKLINE_BUCKETS).fill(0);
  const start = now.getTime() - SPARKLINE_BUCKETS * SPARKLINE_BUCKET_MS;
  for (const row of rows) {
    const offset = ms(row.received_at) - start;
    if (offset < 0 || offset > SPARKLINE_BUCKETS * SPARKLINE_BUCKET_MS) continue;
    buckets[Math.min(SPARKLINE_BUCKETS - 1, Math.floor(offset / SPARKLINE_BUCKET_MS))]! += 1;
  }
  return buckets;
}

export function sessionState(
  ended: boolean,
  lastActivityMs: number,
  activity: SessionActivity,
  now: Date,
): SessionState {
  if (ended) return 'closed';
  const quiet = now.getTime() - lastActivityMs;
  if (quiet > ORPHAN_AFTER_MS) return 'orphaned';
  return quiet <= ACTIVE_WINDOW_MS || activity === 'working' ? 'active' : 'idle';
}

/**
 * Resume una Sesión. `rows` en orden de llegada y de una sola Sesión.
 * `transcriptMtimeMs` cuenta como actividad: una Sesión que escribe su
 * Transcript sin emitir Eventos (respuesta larga del modelo) no está Huérfana.
 * `metaLinks` son los `toolUseId → agentId` de los `.meta.json` del Transcript (AC-33).
 */
export function summarizeSession(
  rows: SessionEventRow[],
  now: Date,
  transcriptMtimeMs?: number,
  metaLinks?: ReadonlyMap<string, string>,
): SessionCore {
  const first = rows[0];
  const last = rows.at(-1);
  if (!first || !last) throw new Error('Una Sesión sin Eventos no se puede resumir');

  const ended = isClosed(rows);
  const lastReceived = Math.max(...rows.map((r) => ms(r.received_at)));
  const lastActivityMs = Math.max(lastReceived, transcriptMtimeMs ?? 0);
  const rawActivity: SessionActivity = IDLE_AFTER.has(last.event_type) ? 'paused' : 'working';
  const state = sessionState(ended, lastActivityMs, rawActivity, now);

  const subagents = subagentLives(rows, metaLinks).filter((s) => !s.internal);
  const live = state === 'active' || state === 'idle';
  const turns = buildTurns(rows);
  const count = (type: EventType) => rows.filter((r) => r.event_type === type).length;
  const tools = live ? openTools(rows) : new Map<string, SessionEventRow>();
  const running = live ? subagents.filter((s) => s.stopped_at === null) : [];

  return {
    session_id: first.session_id,
    project: last.project,
    directory: last.directory,
    harness: last.harness,
    transcript_path: [...rows].reverse().find((r) => r.transcript_path !== null)?.transcript_path ?? null,
    state,
    activity: live ? rawActivity : null,
    open_tool_event_id: latestOf(tools.values()),
    open_tools: Object.fromEntries([...tools].map(([lane, row]) => [lane, row.id])),
    subagents,
    running_subagents_list: running,
    started_at: first.occurred_at,
    last_event_at: last.occurred_at,
    last_activity_at: new Date(lastActivityMs).toISOString(),
    event_count: rows.length,
    tool_count: count('tool.pre'),
    prompt_count: count('prompt.submitted'),
    subagent_count: subagents.length,
    running_subagents: running.length,
    block_count: count('tool.blocked'),
    turns,
    active_duration_ms: turns.reduce((sum, t) => sum + t.duration_ms, 0),
    clock_duration_ms: Math.max(0, ms(last.occurred_at) - ms(first.occurred_at)),
    sparkline: sparkline(rows, now),
  };
}

/**
 * Orden del board: por inicio, la más nueva primero (design §6.1). No depende
 * del Estado ni de la actividad para que las tarjetas no salten al llegar Eventos.
 */
export function compareSessions(
  a: Pick<SessionCore, 'started_at' | 'session_id'>,
  b: Pick<SessionCore, 'started_at' | 'session_id'>,
): number {
  return ms(b.started_at) - ms(a.started_at) || a.session_id.localeCompare(b.session_id);
}
