import { contextWindow, type ContextWindow } from '../domain/context-window.js';
import type { StoredEvent } from '../domain/event.js';
import { estimateCost } from '../domain/pricing.js';
import { summarizeSession, type SessionEventRow } from '../domain/session-summary.js';
import { hintsOf, subagentLives } from '../domain/subagent-lifecycle.js';
import { toolCallsFromEvents, type ToolCall } from '../domain/subagent-activity.js';
import { addUsage, usageByModel, ZERO_USAGE, type UsageEntry } from '../domain/token-usage.js';
import { summarizeToolInput } from '../domain/tool-summary.js';
import { normalizeAgentId } from '../domain/agent-id.js';
import { allEntries, roundCost, toView, type TokenUsageView } from './get-usage-metrics.js';
import { cacheEfficiency, cacheRewrites, type CacheEfficiency, type CacheRewrite } from '../domain/cache-efficiency.js';
import { metaLinksOf, readTranscript, toSessionSummary, type SessionSummary } from './list-sessions.js';
import type { InjectionWarnings } from './injection-warnings.js';
import type { Clock, EvaluationStore, EventRepository, TranscriptData, TranscriptReader } from './ports.js';

export interface TranscriptUsage {
  tokens: TokenUsageView;
  estimated_cost_usd: number | null;
  requests: number;
  models: string[];
}

/** Detalle de Sesión (`SessionDetail` de `spec/api-spec.yaml`). */
export interface SessionDetail extends SessionSummary {
  transcript_available: boolean;
  usage: TranscriptUsage | null;
  /** Eficiencia de la caché de la Sesión y sus Subagentes; `null` sin Transcript (AC-72). */
  cache: CacheEfficiency | null;
  cache_rewrites: CacheRewrite[];
  context: ContextWindow | null;
  tools: Array<{ name: string; count: number }>;
  turns: Array<{
    /** Id del `prompt.submitted` que abre el Turno; identifica el Turno al evaluarlo (AC-54). */
    id: string;
    index: number;
    started_at: string;
    ended_at: string | null;
    duration_ms: number;
    prompt: string | null;
    tool_count: number;
  }>;
  subagents: Array<{
    /** `null` en un lanzamiento pendiente de enlazar (AC-33). */
    subagent_id: string | null;
    tool_use_id: string | null;
    agent_type: string | null;
    internal: boolean;
    started_at: string;
    stopped_at: string | null;
    duration_ms: number;
    tool_count: number;
    model: string | null;
    tokens: TokenUsageView | null;
    /** Tarea del Subagente (AC-23), del Transcript o de su lanzamiento. */
    task: { description: string | null; prompt: string | null } | null;
    tools: ToolCall[];
    result: string | null;
    /** Sin fin, `running` solo con la Sesión viva y el Turno abierto; si no, `no_response` (AC-126). */
    status: 'running' | 'finished' | 'no_response';
  }>;
  blocks: Array<{
    event_id: string;
    occurred_at: string;
    subagent_id: string | null;
    tool_name: string | null;
    summary: string | null;
    rule: string;
    reason: string;
  }>;
}

export function usageOf(entries: UsageEntry[]): TranscriptUsage | null {
  if (entries.length === 0) return null;
  const byModel = usageByModel(entries, new Date(0));
  let total = ZERO_USAGE;
  let cost: number | null = 0;
  for (const [model, usage] of byModel) {
    total = addUsage(total, usage);
    const modelCost = estimateCost(model, usage);
    // Un modelo sin Tarifa hace desconocido el total (ADR-0005): no se muestra un coste parcial como si fuera completo.
    cost = modelCost === undefined || cost === null ? null : cost + modelCost;
  }
  const models = [...byModel].sort((a, b) => b[1].output - a[1].output).map(([model]) => model);
  return {
    tokens: toView(total),
    estimated_cost_usd: cost === null ? null : roundCost(cost),
    requests: new Set(entries.map((e) => e.messageId)).size,
    models,
  };
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** Caso de uso: panel de detalle de Sesión (AC-18). */
export class GetSessionDetail {
  constructor(
    private readonly repository: EventRepository,
    private readonly transcripts: TranscriptReader,
    private readonly clock: Clock,
    private readonly evaluations: EvaluationStore,
    private readonly injections: InjectionWarnings,
  ) {}

  async execute(sessionId: string): Promise<SessionDetail | undefined> {
    const events = this.repository.sessionEvents(sessionId);
    if (events.length === 0) return undefined;
    const now = this.clock.now();
    const pathEvent = [...events].reverse().find((e) => e.transcript_path !== null);
    const transcript = await readTranscript(this.transcripts, pathEvent?.transcript_path ?? null);
    const rows = withHints(events);
    const metaLinks = metaLinksOf(transcript);
    const core = summarizeSession(rows, now, transcript?.mtimeMs, metaLinks);
    const byId = new Map(events.map((e) => [e.id, e]));

    return {
      ...toSessionSummary(core, transcript, (id) => byId.get(id), this.evaluations.sessionScores().get(sessionId) ?? null, this.injections.alertsBySession().get(sessionId) ?? 0, this.repository.budgetStoppedSessions().has(sessionId)),
      transcript_available: transcript !== undefined,
      usage: usageOf(allEntries(transcript)),
      ...cacheOf(transcript),
      context: transcript ? contextWindow(transcript.entries) : null,
      tools: toolUsage(events),
      turns: core.turns.map((turn) => ({
        id: turn.prompt_event_id,
        index: turn.index,
        started_at: turn.started_at,
        ended_at: turn.ended_at,
        duration_ms: turn.duration_ms,
        prompt: text(byId.get(turn.prompt_event_id)?.payload.prompt),
        tool_count: turn.tool_count,
      })),
      subagents: subagents(rows, byId, transcript, metaLinks, (core.state === 'active' || core.state === 'idle') && core.turn_open),
      blocks: events
        .filter((e) => e.event_type === 'tool.blocked' && e.block)
        .map((e) => ({
          event_id: e.id,
          occurred_at: e.occurred_at,
          subagent_id: e.subagent_id,
          tool_name: e.tool_name,
          summary: summarizeToolInput(e.tool_name, e.payload),
          rule: e.block!.rule,
          reason: e.block!.reason,
        })),
    };
  }
}

/** Eficiencia de la caché y Reescrituras de todo el Transcript (AC-72). */
function cacheOf(transcript: TranscriptData | undefined): Pick<SessionDetail, 'cache' | 'cache_rewrites'> {
  if (!transcript) return { cache: null, cache_rewrites: [] };
  const rewrites = [
    ...cacheRewrites(transcript.entries, null),
    ...transcript.subagents.flatMap((s) => cacheRewrites(s.entries, s.agentId)),
  ].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const cost = rewrites.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
  return {
    cache: cacheEfficiency(usageByModel(allEntries(transcript), new Date(0)), { count: rewrites.length, cost_usd: cost }),
    cache_rewrites: rewrites,
  };
}

function toolUsage(events: StoredEvent[]): SessionDetail['tools'] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.event_type === 'tool.pre' && e.tool_name) counts.set(e.tool_name, (counts.get(e.tool_name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Eventos completos con las pistas que el repositorio saca en SQL para el board (AC-33). */
function withHints(events: StoredEvent[]): Array<StoredEvent & SessionEventRow> {
  return events.map((e) => ({ ...e, ...hintsOf(e.event_type, e.tool_name, e.payload, e.subagent_id) }));
}

function subagents(
  rows: Array<StoredEvent & SessionEventRow>,
  byId: Map<string, StoredEvent>,
  transcript: TranscriptData | undefined,
  metaLinks: ReadonlyMap<string, string>,
  running: boolean,
): SessionDetail['subagents'] {
  return subagentLives(rows, metaLinks).map((life) => {
    const id = life.subagent_id;
    const own = id === null ? [] : rows.filter((e) => e.subagent_id === id);
    const stop = life.stop_event_id ? byId.get(life.stop_event_id) : undefined;
    const launch = life.launch_event_id ? byId.get(life.launch_event_id) : undefined;
    const launchPrompt = text((launch?.payload.tool_input as Record<string, unknown> | undefined)?.prompt);
    const file = id === null ? undefined : transcript?.subagents.find((s) => s.agentId === normalizeAgentId(id));
    const usage = file ? usageOf(file.entries) : null;
    const end = life.stopped_at ?? own.at(-1)?.occurred_at ?? life.started_at;
    // Los Eventos van en vivo y traen los Bloqueos; el Transcript cubre Subagentes sin hooks.
    const fromEvents = toolCallsFromEvents(own);
    return {
      subagent_id: id,
      tool_use_id: life.tool_use_id,
      agent_type: life.agent_type ?? file?.meta?.agentType ?? null,
      internal: life.internal,
      started_at: life.started_at,
      stopped_at: life.stopped_at,
      duration_ms: Math.max(0, Date.parse(end) - Date.parse(life.started_at)),
      tool_count: life.tool_count,
      model: usage?.models[0] ?? null,
      tokens: usage?.tokens ?? null,
      task:
        file || launch
          ? { description: file?.meta?.description ?? life.description, prompt: file?.activity.prompt ?? launchPrompt }
          : null,
      tools: fromEvents.length > 0 ? fromEvents : (file?.activity.tools ?? []),
      // Mientras sigue en marcha, el último texto es un borrador, no la respuesta.
      result: stop ? (file?.activity.result ?? text(stop.payload.last_assistant_message)) : null,
      status: life.stopped_at !== null ? 'finished' : running ? 'running' : 'no_response',
    };
  });
}
