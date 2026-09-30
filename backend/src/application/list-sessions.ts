import { latestModel } from '../domain/context-window.js';
import {
  compareSessions,
  summarizeSession,
  type SessionActivity,
  type SessionCore,
  type SessionEventRow,
  type SessionState,
  type WaitingCore,
} from '../domain/session-summary.js';
import { normalizeAgentId } from '../domain/agent-id.js';
import type { StoredEvent } from '../domain/event.js';
import type { Score } from '../domain/evaluation.js';
import { summarizeToolInput } from '../domain/tool-summary.js';
import type { InjectionWarnings } from './injection-warnings.js';
import type { Clock, EvaluationStore, EventRepository, TranscriptData, TranscriptReader } from './ports.js';

export type CurrentTool = { name: string; summary: string | null } | null;

export interface LiveSubagent {
  /** `null` en un lanzamiento pendiente de enlazar (AC-33). */
  subagent_id: string | null;
  agent_type: string | null;
  /** Descripción de la Tarea del Subagente. */
  description: string | null;
  current_tool: CurrentTool;
}

/** Forma pública de una Sesión del board (`SessionSummary` de `spec/api-spec.yaml`). */
export interface SessionSummary {
  session_id: string;
  project: string;
  directory: string;
  harness: string;
  state: SessionState;
  activity: SessionActivity | null;
  /** Solo con `activity = waiting` (ADR-0011, AC-92). */
  waiting: WaitingCore | null;
  current_tool: CurrentTool;
  model: string | null;
  started_at: string;
  last_event_at: string;
  last_activity_at: string;
  event_count: number;
  tool_count: number;
  prompt_count: number;
  turn_count: number;
  subagent_count: number;
  running_subagents: number;
  live_subagents: LiveSubagent[];
  block_count: number;
  /** Puntuación de la Evaluación de la Sesión (AC-59). */
  evaluation_score: Score | null;
  /** Avisos de inyección de severidad alta sin descartar (AC-68). */
  injection_alerts: number;
  /** El último Bloqueo de la Sesión lo produjo la regla `budget` (AC-84). */
  budget_stopped: boolean;
  active_duration_ms: number;
  clock_duration_ms: number;
  sparkline: number[];
}

export interface SessionFilter {
  since?: Date;
  states?: SessionState[];
  directory?: string;
  project?: string;
}

export interface SessionList {
  items: SessionSummary[];
  /** Valores disponibles para los filtros, antes de aplicar Estado, Directorio y Proyecto. */
  facets: { projects: string[]; directories: string[] };
}

/** Lee el Transcript de una Sesión, si lo hay; comparte la caché del lector. */
export async function readTranscript(
  reader: TranscriptReader,
  path: string | null,
): Promise<TranscriptData | undefined> {
  return path === null ? undefined : reader.read(path);
}

/** Caso de uso: board de Sesiones con Estados y filtros (AC-14, AC-15). */
export class ListSessions {
  constructor(
    private readonly repository: EventRepository,
    private readonly transcripts: TranscriptReader,
    private readonly clock: Clock,
    private readonly evaluations: EvaluationStore,
    private readonly injections: InjectionWarnings,
  ) {}

  async execute(filter: SessionFilter = {}): Promise<SessionList> {
    const now = this.clock.now();
    const scores = this.evaluations.sessionScores();
    const alerts = this.injections.alertsBySession();
    const stopped = this.repository.budgetStoppedSessions();
    const rows = this.repository.sessionRows({ since: filter.since?.toISOString() });

    const bySession = new Map<string, SessionEventRow[]>();
    for (const row of rows) {
      const list = bySession.get(row.session_id);
      if (list) list.push(row);
      else bySession.set(row.session_id, [row]);
    }

    const sessions = await Promise.all(
      [...bySession.values()].map(async (sessionRows) => {
        const pathRow = [...sessionRows].reverse().find((r) => r.transcript_path !== null);
        const transcript = await readTranscript(this.transcripts, pathRow?.transcript_path ?? null);
        return { core: summarizeSession(sessionRows, now, transcript?.mtimeMs, metaLinksOf(transcript)), transcript };
      }),
    );

    const facets = {
      projects: [...new Set(sessions.map((s) => s.core.project))].sort(),
      directories: [...new Set(sessions.map((s) => s.core.directory))].sort(),
    };
    const items = sessions
      .filter(({ core }) => !filter.states?.length || filter.states.includes(core.state))
      .filter(({ core }) => filter.directory === undefined || core.directory === filter.directory)
      .filter(({ core }) => filter.project === undefined || core.project === filter.project)
      .sort((a, b) => compareSessions(a.core, b.core))
      .map(({ core, transcript }) => this.toSummary(core, transcript, scores.get(core.session_id) ?? null, alerts.get(core.session_id) ?? 0, stopped.has(core.session_id)));
    return { items, facets };
  }

  private toSummary(core: SessionCore, transcript: TranscriptData | undefined, score: Score | null, alerts: number, stopped: boolean): SessionSummary {
    // Las filas del board no traen payload: solo se cargan los Eventos que se muestran.
    return toSessionSummary(core, transcript, (id) => this.repository.findById(id), score, alerts, stopped);
  }
}

type EventLookup = (id: string) => StoredEvent | undefined;

function toolOf(lookup: EventLookup, eventId: string | undefined | null): CurrentTool {
  const event = eventId ? lookup(eventId) : undefined;
  if (!event?.tool_name) return null;
  return { name: event.tool_name, summary: summarizeToolInput(event.tool_name, event.payload) };
}

/** `toolUseId → agentId` de los `.meta.json` del Transcript: el enlace exacto de cada lanzamiento (AC-33). */
export function metaLinksOf(transcript: TranscriptData | undefined): Map<string, string> {
  return new Map(
    (transcript?.subagents ?? []).filter((s) => s.meta?.toolUseId).map((s) => [s.meta!.toolUseId!, s.agentId] as const),
  );
}

/** Subagentes en marcha con su Tarea y su herramienta en curso (AC-15, AC-34). */
function liveSubagents(core: SessionCore, transcript: TranscriptData | undefined, lookup: EventLookup): LiveSubagent[] {
  return core.running_subagents_list.map((life) => {
    const id = life.subagent_id;
    const file = id === null ? undefined : transcript?.subagents.find((s) => s.agentId === normalizeAgentId(id));
    return {
      subagent_id: id,
      agent_type: life.agent_type ?? file?.meta?.agentType ?? null,
      description: life.description ?? file?.meta?.description ?? null,
      current_tool: id === null ? null : toolOf(lookup, core.open_tools[id]),
    };
  });
}

export function toSessionSummary(
  core: SessionCore,
  transcript: TranscriptData | undefined,
  lookup: EventLookup,
  evaluationScore: Score | null = null,
  injectionAlerts = 0,
  budgetStopped = false,
): SessionSummary {
  // Esperando conserva la herramienta abierta: es la que pide permiso o hace la pregunta (AC-92).
  const currentTool = core.activity === 'working' || core.activity === 'waiting' ? toolOf(lookup, core.open_tool_event_id) : null;
  return {
    session_id: core.session_id,
    project: core.project,
    directory: core.directory,
    harness: core.harness,
    state: core.state,
    activity: core.activity,
    waiting: core.waiting,
    current_tool: currentTool,
    model: transcript ? latestModel(transcript.entries) : null,
    started_at: core.started_at,
    last_event_at: core.last_event_at,
    last_activity_at: core.last_activity_at,
    event_count: core.event_count,
    tool_count: core.tool_count,
    prompt_count: core.prompt_count,
    turn_count: core.turns.length,
    subagent_count: core.subagent_count,
    running_subagents: core.running_subagents,
    live_subagents: liveSubagents(core, transcript, lookup),
    block_count: core.block_count,
    evaluation_score: evaluationScore,
    injection_alerts: injectionAlerts,
    budget_stopped: budgetStopped,
    active_duration_ms: core.active_duration_ms,
    clock_duration_ms: core.clock_duration_ms,
    sparkline: core.sparkline,
  };
}
