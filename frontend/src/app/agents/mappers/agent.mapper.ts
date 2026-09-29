import { TokenUsageDto, subagentKey, toTokenUsage } from '../../sessions/mappers/session.mapper';
import { AgentLaunch, AgentProfile, AgentTypeList, AgentTypeSummary, LaunchStatus } from '../models/agent';

/** `AgentTypeSummary` de `spec/api-spec.yaml`. */
export interface AgentTypeSummaryDto {
  type: string | null;
  launches: number;
  running: number;
  no_response: number;
  foreground: number;
  background: number;
  duration_p50_ms: number | null;
  duration_p95_ms: number | null;
  tokens: TokenUsageDto;
  estimated_cost_usd: number;
  cost_per_launch_usd: number | null;
  tool_errors_per_launch: number;
  blocks_per_launch: number;
  /** Opcionales para aceptar backends anteriores a la rebanada 14. */
  cache_hit_rate?: number | null;
  cache_savings_net_usd?: number;
  rated_up: number;
  rated_down: number;
  sessions: number;
  projects: string[];
  last_at: string;
}

/** `AgentLaunch` de `spec/api-spec.yaml`. */
export interface AgentLaunchDto {
  session_id: string;
  project: string;
  subagent_id: string | null;
  tool_use_id: string | null;
  description: string | null;
  status: LaunchStatus;
  background: boolean;
  started_at: string;
  stopped_at: string | null;
  duration_ms: number;
  tool_count: number;
  tool_errors: number;
  blocks: number;
  model: string | null;
  tokens: TokenUsageDto | null;
  estimated_cost_usd: number | null;
  cache_hit_rate?: number | null;
  cache_savings_net_usd?: number | null;
  result: string | null;
}

/** `AgentProfile` de `spec/api-spec.yaml`. */
export interface AgentProfileDto {
  summary: AgentTypeSummaryDto;
  launched_by: Array<{ launcher: string | null; launches: number }>;
  models: Array<{ model: string; launches: number }>;
  tools: Array<{ name: string; calls: number; errors: number; blocks: number }>;
  skills: Array<{ skill: string; invocations: number }>;
  mcp_servers: Array<{ server: string; calls: number; errors: number }>;
  test_runs: { total: number; passed: number; failed: number };
  launches: AgentLaunchDto[];
}

/** Respuesta de `GET /api/v1/agents`. */
export interface AgentTypeListDto {
  items: AgentTypeSummaryDto[];
  facets: { projects: string[] };
}

export function toAgentTypeSummary(dto: AgentTypeSummaryDto): AgentTypeSummary {
  return {
    type: dto.type,
    launches: dto.launches,
    running: dto.running,
    noResponse: dto.no_response,
    foreground: dto.foreground,
    background: dto.background,
    durationP50Ms: dto.duration_p50_ms,
    durationP95Ms: dto.duration_p95_ms,
    tokens: toTokenUsage(dto.tokens),
    estimatedCostUsd: dto.estimated_cost_usd,
    costPerLaunchUsd: dto.cost_per_launch_usd,
    toolErrorsPerLaunch: dto.tool_errors_per_launch,
    blocksPerLaunch: dto.blocks_per_launch,
    cacheHitRate: dto.cache_hit_rate ?? null,
    cacheSavingsNetUsd: dto.cache_savings_net_usd ?? 0,
    ratedUp: dto.rated_up,
    ratedDown: dto.rated_down,
    sessions: dto.sessions,
    projects: [...dto.projects],
    // Un Tipo sin Lanzamientos en el periodo no tiene última vez.
    lastAt: dto.last_at ? new Date(dto.last_at) : null,
  };
}

export function toAgentLaunch(dto: AgentLaunchDto): AgentLaunch {
  return {
    key: subagentKey(dto.subagent_id, dto.tool_use_id),
    sessionId: dto.session_id,
    project: dto.project,
    subagentId: dto.subagent_id,
    toolUseId: dto.tool_use_id,
    description: dto.description,
    status: dto.status,
    background: dto.background,
    startedAt: new Date(dto.started_at),
    stoppedAt: dto.stopped_at === null ? null : new Date(dto.stopped_at),
    durationMs: dto.duration_ms,
    toolCount: dto.tool_count,
    toolErrors: dto.tool_errors,
    blocks: dto.blocks,
    model: dto.model,
    tokens: dto.tokens && toTokenUsage(dto.tokens),
    estimatedCostUsd: dto.estimated_cost_usd,
    cacheHitRate: dto.cache_hit_rate ?? null,
    cacheSavingsNetUsd: dto.cache_savings_net_usd ?? null,
    result: dto.result,
  };
}

export function toAgentProfile(dto: AgentProfileDto): AgentProfile {
  return {
    summary: toAgentTypeSummary(dto.summary),
    launchedBy: dto.launched_by.map((l) => ({ ...l })),
    models: dto.models.map((m) => ({ ...m })),
    tools: dto.tools.map((t) => ({ ...t })),
    skills: dto.skills.map((s) => ({ ...s })),
    mcpServers: dto.mcp_servers.map((m) => ({ ...m })),
    testRuns: { ...dto.test_runs },
    launches: dto.launches.map(toAgentLaunch),
  };
}

export function toAgentTypeList(dto: AgentTypeListDto): AgentTypeList {
  return { items: dto.items.map(toAgentTypeSummary), projects: [...dto.facets.projects] };
}
