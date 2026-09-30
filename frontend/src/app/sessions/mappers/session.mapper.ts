import {
  CacheRewrite,
  SessionActivity,
  SessionDetail,
  SessionList,
  SessionState,
  SessionSummary,
  TokenUsage,
  ToolCallStatus,
  WaitingReason,
} from '../models/session';
import { CacheEfficiencyDto, toCache } from '../../usage/mappers/usage-metrics.mapper';

/** `TokenUsage` de `spec/api-spec.yaml`. */
export interface TokenUsageDto {
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
}

/** `SessionSummary` de `spec/api-spec.yaml`. */
export interface SessionSummaryDto {
  session_id: string;
  project: string;
  directory: string;
  harness: string;
  state: SessionState;
  activity: SessionActivity | null;
  /** Opcional para aceptar backends anteriores a la rebanada 16. */
  waiting?: {
    since: string;
    reason: WaitingReason;
    tool: string | null;
    summary: string | null;
    subagent: { id: string; type: string | null } | null;
  } | null;
  current_tool: { name: string; summary: string | null } | null;
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
  live_subagents: Array<{
    subagent_id: string | null;
    agent_type: string | null;
    description: string | null;
    current_tool: { name: string; summary: string | null } | null;
  }>;
  block_count: number;
  evaluation_score: 1 | -1 | null;
  /** Opcional para aceptar backends anteriores a la rebanada 13. */
  injection_alerts?: number;
  /** Opcional para aceptar backends anteriores a la rebanada 15. */
  budget_stopped?: boolean;
  active_duration_ms: number;
  clock_duration_ms: number;
  sparkline: number[];
}

export interface SessionListDto {
  items: SessionSummaryDto[];
  facets: { projects: string[]; directories: string[] };
}

/** `SessionDetail` de `spec/api-spec.yaml`. */
export interface SessionDetailDto extends SessionSummaryDto {
  transcript_available: boolean;
  /** Opcional para aceptar backends anteriores a la rebanada 14. */
  cache?: CacheEfficiencyDto | null;
  cache_rewrites?: Array<{
    message_id: string;
    subagent_id: string | null;
    occurred_at: string;
    model: string;
    cause: CacheRewrite['cause'];
    written_tokens: number;
    cost_usd: number | null;
    gap_ms: number | null;
  }>;
  usage: {
    tokens: TokenUsageDto;
    estimated_cost_usd: number | null;
    requests: number;
    models: string[];
  } | null;
  context: { model: string; used: number; limit: number } | null;
  tools: Array<{ name: string; count: number }>;
  turns: Array<{
    id: string;
    index: number;
    started_at: string;
    ended_at: string | null;
    duration_ms: number;
    prompt: string | null;
    tool_count: number;
  }>;
  subagents: Array<{
    subagent_id: string | null;
    /** Opcionales para aceptar backends anteriores a la rebanada 7. */
    tool_use_id?: string | null;
    internal?: boolean;
    agent_type: string | null;
    started_at: string;
    stopped_at: string | null;
    duration_ms: number;
    tool_count: number;
    model: string | null;
    tokens: TokenUsageDto | null;
    task: { description: string | null; prompt: string | null } | null;
    tools: Array<{
      name: string;
      summary: string | null;
      started_at: string;
      status: ToolCallStatus;
    }>;
    result: string | null;
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

const date = (iso: string) => new Date(iso);
const optionalDate = (iso: string | null) => (iso === null ? null : new Date(iso));

export const toTokenUsage = (dto: TokenUsageDto): TokenUsage => ({
  input: dto.input,
  output: dto.output,
  cacheRead: dto.cache_read,
  cacheCreation: dto.cache_creation,
});

/** Identifica un Subagente de la Sesión, esté ya enlazado o solo lanzado (AC-33). */
export function subagentKey(subagentId: string | null, toolUseId: string | null): string {
  return subagentId ?? `launch:${toolUseId ?? '?'}`;
}

export function toSessionSummary(dto: SessionSummaryDto): SessionSummary {
  return {
    sessionId: dto.session_id,
    project: dto.project,
    directory: dto.directory,
    harness: dto.harness,
    state: dto.state,
    activity: dto.activity,
    waiting: dto.waiting
      ? {
          ...dto.waiting,
          since: date(dto.waiting.since),
          subagent: dto.waiting.subagent && { ...dto.waiting.subagent },
        }
      : null,
    currentTool: dto.current_tool,
    model: dto.model,
    startedAt: date(dto.started_at),
    lastEventAt: date(dto.last_event_at),
    lastActivityAt: date(dto.last_activity_at),
    eventCount: dto.event_count,
    toolCount: dto.tool_count,
    promptCount: dto.prompt_count,
    turnCount: dto.turn_count,
    subagentCount: dto.subagent_count,
    runningSubagents: dto.running_subagents,
    liveSubagents: dto.live_subagents.map((s) => ({
      subagentId: s.subagent_id,
      agentType: s.agent_type,
      description: s.description,
      currentTool: s.current_tool,
    })),
    blockCount: dto.block_count,
    evaluationScore: dto.evaluation_score,
    injectionAlerts: dto.injection_alerts ?? 0,
    budgetStopped: dto.budget_stopped ?? false,
    activeDurationMs: dto.active_duration_ms,
    clockDurationMs: dto.clock_duration_ms,
    sparkline: [...dto.sparkline],
  };
}

export function toSessionList(dto: SessionListDto): SessionList {
  return {
    items: dto.items.map(toSessionSummary),
    facets: { projects: [...dto.facets.projects], directories: [...dto.facets.directories] },
  };
}

export function toSessionDetail(dto: SessionDetailDto): SessionDetail {
  return {
    ...toSessionSummary(dto),
    transcriptAvailable: dto.transcript_available,
    cache: toCache(dto.cache),
    cacheRewrites: (dto.cache_rewrites ?? []).map((r) => ({
      messageId: r.message_id,
      subagentId: r.subagent_id,
      occurredAt: date(r.occurred_at),
      model: r.model,
      cause: r.cause,
      writtenTokens: r.written_tokens,
      costUsd: r.cost_usd,
      gapMs: r.gap_ms,
    })),
    usage: dto.usage && {
      tokens: toTokenUsage(dto.usage.tokens),
      estimatedCostUsd: dto.usage.estimated_cost_usd,
      requests: dto.usage.requests,
      models: [...dto.usage.models],
    },
    context: dto.context && { ...dto.context },
    tools: dto.tools.map((t) => ({ ...t })),
    turns: dto.turns.map((t) => ({
      id: t.id,
      index: t.index,
      startedAt: date(t.started_at),
      endedAt: optionalDate(t.ended_at),
      durationMs: t.duration_ms,
      prompt: t.prompt,
      toolCount: t.tool_count,
    })),
    subagents: dto.subagents.map((s) => ({
      key: subagentKey(s.subagent_id, s.tool_use_id ?? null),
      subagentId: s.subagent_id,
      toolUseId: s.tool_use_id ?? null,
      agentType: s.agent_type,
      internal: s.internal ?? false,
      startedAt: date(s.started_at),
      stoppedAt: optionalDate(s.stopped_at),
      durationMs: s.duration_ms,
      toolCount: s.tool_count,
      model: s.model,
      tokens: s.tokens && toTokenUsage(s.tokens),
      task: s.task && { ...s.task },
      tools: s.tools.map((t) => ({
        name: t.name,
        summary: t.summary,
        startedAt: date(t.started_at),
        status: t.status,
      })),
      result: s.result,
    })),
    blocks: dto.blocks.map((b) => ({
      eventId: b.event_id,
      occurredAt: date(b.occurred_at),
      subagentId: b.subagent_id,
      toolName: b.tool_name,
      summary: b.summary,
      rule: b.rule,
      reason: b.reason,
    })),
  };
}
