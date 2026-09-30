import { normalizeAgentId } from '../domain/agent-id.js';
import { cacheEfficiency, cacheRewrites, type CacheEfficiency, type CacheRewrite } from '../domain/cache-efficiency.js';
import { latestModel } from '../domain/context-window.js';
import { aggregate, aggregateBy, modelAt, type Contribution, type Slice } from '../domain/metrics-breakdown.js';
import { costByClass, estimateCost, rateTable } from '../domain/pricing.js';
import { summarizeSession, type SessionCore, type SessionEventRow } from '../domain/session-summary.js';
import { ZERO_USAGE, type TokenUsage, type UsageEntry } from '../domain/token-usage.js';
import { metaLinksOf, readTranscript } from './list-sessions.js';
import type { ActivityCounts, Clock, EventRepository, TranscriptData, TranscriptReader } from './ports.js';

/** Forma pública del Uso de tokens (`TokenUsage` de `spec/api-spec.yaml`). */
export interface TokenUsageView {
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
}

export type SessionCondition = 'working' | 'paused' | 'waiting' | 'orphaned' | 'closed';

/** `MetricsSlice` de `spec/api-spec.yaml` (AC-38). */
export interface MetricsSlice {
  sessions: { working: number; paused: number; orphaned: number };
  subagents_running: number;
  activity: { tool_calls: number; prompts: number; blocks: number };
  tokens: TokenUsageView;
  estimated_cost_usd: number;
  unpriced_models: string[];
  cache: CacheEfficiency;
}

export interface DirectoryBreakdown extends MetricsSlice {
  directory: string;
  project: string;
  main_model: string | null;
  transcripts_unavailable: number;
}

export interface ModelBreakdown extends MetricsSlice {
  model: string | null;
  rate: ReturnType<typeof rateTable>;
  cost_breakdown: ReturnType<typeof costByClass>;
}

export interface UsageMetrics {
  since: string;
  generated_at: string;
  sessions: { total: number } & Record<SessionCondition, number>;
  subagents_running: number;
  activity: ActivityCounts;
  tokens: TokenUsageView;
  estimated_cost_usd: number;
  unpriced_models: string[];
  cache: CacheEfficiency;
  by_model: Array<{ model: string; tokens: TokenUsageView; estimated_cost_usd: number | null }>;
  transcripts: { read: number; unavailable: number };
  breakdown: { by_directory: DirectoryBreakdown[]; by_model: ModelBreakdown[] } | null;
}

export interface MetricsOptions {
  /** Solo las Sesiones de este Directorio, como el filtro del board. */
  directory?: string;
  /** Añade el desglose por Directorio y por modelo (AC-38). */
  breakdown?: boolean;
}

/** Respuestas del agente principal y de todos sus Subagentes. */
export const allEntries = (data: TranscriptData | undefined): UsageEntry[] =>
  data ? [...data.entries, ...data.subagents.flatMap((s) => s.entries)] : [];

export const toView = (u: TokenUsage): TokenUsageView => ({
  input: u.input,
  output: u.output,
  cache_read: u.cache_read,
  cache_creation: u.cache_creation_5m + u.cache_creation_1h,
});

// Evita arrastrar decimales de coma flotante hasta la UI.
export const roundCost = (usd: number) => Math.round(usd * 1e6) / 1e6;

interface SessionData {
  rows: SessionEventRow[];
  core: SessionCore;
  transcript: TranscriptData | undefined;
  /** La Sesión anuncia un Transcript, aunque no se haya podido leer. */
  hasTranscriptPath: boolean;
}

const ACTIVITY_FIELD = { 'tool.pre': 'tool_calls', 'prompt.submitted': 'prompts', 'tool.blocked': 'blocks' } as const;

function conditionOf(core: SessionCore): SessionCondition {
  if (core.state === 'closed' || core.state === 'orphaned') return core.state;
  return core.activity ?? 'paused';
}

/**
 * Lo que aporta una Sesión a las fichas, atribuido a su Directorio y al modelo
 * en uso (AC-38). `seen` evita contar dos veces una respuesta repetida entre Transcripts.
 */
function contributionsOf({ rows, core, transcript }: SessionData, since: Date, seen: Set<string>): Contribution[] {
  const base = { directory: core.directory, project: core.project, working: 0, paused: 0, orphaned: 0, subagents_running: 0, tool_calls: 0, prompts: 0, blocks: 0 };
  const main = transcript?.entries ?? [];
  const entriesOf = (subagentId: string | null) =>
    subagentId === null ? main : (transcript?.subagents.find((s) => s.agentId === normalizeAgentId(subagentId))?.entries ?? []);
  const contributions: Contribution[] = [];
  // Una Reescritura se detecta con toda la conversación de su agente, aunque la anterior sea previa a `since`.
  const rewrites = new Map<string, CacheRewrite>(
    [
      ...cacheRewrites(main, null),
      ...(transcript?.subagents ?? []).flatMap((s) => cacheRewrites(s.entries, s.agentId)),
    ].map((r) => [r.message_id, r]),
  );

  const condition = conditionOf(core);
  // `MetricsSlice.sessions` no tiene Esperando (AC-92 lo cuenta solo en el total): en un desglose no suma a nada.
  if (condition !== 'closed') contributions.push({ ...base, model: latestModel(main), ...(condition === 'waiting' ? {} : { [condition]: 1 }) });
  for (const life of core.running_subagents_list) {
    contributions.push({ ...base, model: latestModel(entriesOf(life.subagent_id)), subagents_running: 1 });
  }
  const sinceIso = since.toISOString();
  for (const row of rows) {
    const field = ACTIVITY_FIELD[row.event_type as keyof typeof ACTIVITY_FIELD];
    if (!field || row.received_at < sinceIso) continue;
    contributions.push({ ...base, model: modelAt(entriesOf(row.subagent_id), row.occurred_at), [field]: 1 });
  }
  for (const entry of allEntries(transcript)) {
    if (seen.has(entry.messageId) || Date.parse(entry.timestamp) < since.getTime()) continue;
    seen.add(entry.messageId);
    contributions.push({ ...base, model: entry.model, usage: entry.usage, rewrite: rewrites.get(entry.messageId) });
  }
  return contributions;
}

function toSliceView(slice: Slice): MetricsSlice {
  return {
    sessions: { ...slice.sessions },
    subagents_running: slice.subagents_running,
    activity: { ...slice.activity },
    tokens: toView(slice.tokens),
    estimated_cost_usd: roundCost(slice.estimated_cost_usd),
    unpriced_models: [...slice.unpriced_models],
    cache: cacheOf(slice),
  };
}

const cacheOf = (slice: Slice): CacheEfficiency =>
  cacheEfficiency(slice.usage_by_model, { count: slice.cache_rewrites, cost_usd: slice.cache_rewrite_cost_usd });

const roundAll = <T extends Record<string, number>>(costs: T | null): T | null =>
  costs && (Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, roundCost(v)])) as T);

/** Caso de uso: fichas de uso del periodo del board y su desglose (AC-11, AC-12, AC-38). */
export class GetUsageMetrics {
  constructor(
    private readonly repository: EventRepository,
    private readonly transcripts: TranscriptReader,
    private readonly clock: Clock,
  ) {}

  async execute(since: Date, { directory, breakdown = false }: MetricsOptions = {}): Promise<UsageMetrics> {
    const now = this.clock.now();
    const sinceIso = since.toISOString();
    const bySession = new Map<string, SessionEventRow[]>();
    for (const row of this.repository.sessionRows({ since: sinceIso })) {
      const rows = bySession.get(row.session_id);
      if (rows) rows.push(row);
      else bySession.set(row.session_id, [row]);
    }
    const all = await Promise.all(
      [...bySession.values()].map(async (rows): Promise<SessionData> => {
        const path = [...rows].reverse().find((r) => r.transcript_path !== null)?.transcript_path ?? null;
        const transcript = await readTranscript(this.transcripts, path);
        return { rows, core: summarizeSession(rows, now, transcript?.mtimeMs, metaLinksOf(transcript)), transcript, hasTranscriptPath: path !== null };
      }),
    );
    const selected = directory === undefined ? all : all.filter((s) => s.core.directory === directory);

    const seen = new Set<string>();
    const contributions = selected.flatMap((s) => contributionsOf(s, since, seen));
    const total = aggregate(contributions);

    const sessions = { total: selected.length, working: 0, paused: 0, waiting: 0, orphaned: 0, closed: 0 };
    for (const s of selected) sessions[conditionOf(s.core)] += 1;
    const byModel = [...total.usage_by_model]
      .map(([model, usage]) => {
        const cost = estimateCost(model, usage);
        return { model, tokens: toView(usage), estimated_cost_usd: cost === undefined ? null : roundCost(cost) };
      })
      .sort((a, b) => (b.estimated_cost_usd ?? -1) - (a.estimated_cost_usd ?? -1));
    const unavailable = (group: SessionData[]) => group.filter((s) => s.hasTranscriptPath && s.transcript === undefined).length;
    const withPath = selected.filter((s) => s.hasTranscriptPath).length;

    return {
      since: sinceIso,
      generated_at: now.toISOString(),
      sessions,
      subagents_running: total.subagents_running,
      activity: {
        events: selected.reduce((n, s) => n + s.rows.filter((r) => r.received_at >= sinceIso).length, 0),
        ...total.activity,
      },
      tokens: toView(total.tokens),
      estimated_cost_usd: roundCost(total.estimated_cost_usd),
      unpriced_models: total.unpriced_models,
      cache: cacheOf(total),
      by_model: byModel,
      transcripts: { read: withPath - unavailable(selected), unavailable: unavailable(selected) },
      breakdown: breakdown ? this.breakdown(contributions, selected) : null,
    };
  }

  private breakdown(contributions: Contribution[], sessions: SessionData[]): NonNullable<UsageMetrics['breakdown']> {
    const byDirectory = [...aggregateBy(contributions, (c) => c.directory)].map(([directory, slice]): DirectoryBreakdown => {
      const own = sessions.filter((s) => s.core.directory === directory);
      return {
        directory,
        project: own[0]?.core.project ?? '',
        main_model: slice.main_model,
        transcripts_unavailable: own.filter((s) => s.hasTranscriptPath && s.transcript === undefined).length,
        ...toSliceView(slice),
      };
    });
    const byModel = [...aggregateBy(contributions, (c) => c.model)].map(
      ([model, slice]): ModelBreakdown => ({
        model,
        rate: model === null ? null : rateTable(model),
        cost_breakdown: model === null ? null : roundAll(costByClass(model, slice.usage_by_model.get(model) ?? ZERO_USAGE)),
        ...toSliceView(slice),
      }),
    );
    return { by_directory: byDirectory, by_model: byModel };
  }
}
