import {
  McpInvocation,
  McpInvocationList,
  McpInvocationStatus,
  McpServerUsage,
  McpToolUsage,
  McpUsageStats,
} from '../models/mcp';

/** `McpInvocation` de `spec/api-spec.yaml`. */
export interface McpInvocationDto {
  id: string;
  event_id: string;
  project: string;
  directory: string;
  session_id: string;
  subagent_id: string | null;
  server: string;
  scope: string | null;
  tool: string;
  tool_name: string;
  summary: string | null;
  status: McpInvocationStatus;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  response_bytes: number | null;
  has_image: boolean;
  error: string | null;
}

/** `McpUsageStats` de `spec/api-spec.yaml`. */
export interface McpUsageStatsDto {
  calls: number;
  ok: number;
  errors: number;
  interrupted: number;
  blocked: number;
  running: number;
  no_response: number;
  failure_rate: number | null;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  response_avg_bytes: number | null;
  response_max_bytes: number | null;
  has_image: boolean;
  last_at: string;
  sessions: number;
}

export type McpToolUsageDto = McpUsageStatsDto & { tool: string; tool_name: string };
export type McpServerUsageDto = McpUsageStatsDto & { server: string; scopes: string[]; projects: string[]; tools: McpToolUsageDto[] };

/** Respuesta de `GET /api/v1/mcp-invocations`. */
export interface McpInvocationListDto {
  items: McpInvocationDto[];
  servers: McpServerUsageDto[];
  unused_deferred: Array<{ session_id: string; tool_name: string; server: string; tool: string; loaded_at: string }>;
  facets: { projects: string[]; servers: string[] };
}

export function toMcpInvocation(dto: McpInvocationDto): McpInvocation {
  return {
    id: dto.id,
    eventId: dto.event_id,
    project: dto.project,
    directory: dto.directory,
    sessionId: dto.session_id,
    subagentId: dto.subagent_id,
    server: dto.server,
    scope: dto.scope,
    tool: dto.tool,
    toolName: dto.tool_name,
    summary: dto.summary,
    status: dto.status,
    startedAt: new Date(dto.started_at),
    endedAt: dto.ended_at === null ? null : new Date(dto.ended_at),
    durationMs: dto.duration_ms,
    responseBytes: dto.response_bytes,
    hasImage: dto.has_image,
    error: dto.error,
  };
}

function toStats(dto: McpUsageStatsDto): McpUsageStats {
  return {
    calls: dto.calls,
    ok: dto.ok,
    errors: dto.errors,
    interrupted: dto.interrupted,
    blocked: dto.blocked,
    running: dto.running,
    noResponse: dto.no_response,
    failureRate: dto.failure_rate,
    latencyP50Ms: dto.latency_p50_ms,
    latencyP95Ms: dto.latency_p95_ms,
    responseAvgBytes: dto.response_avg_bytes,
    responseMaxBytes: dto.response_max_bytes,
    hasImage: dto.has_image,
    lastAt: new Date(dto.last_at),
    sessions: dto.sessions,
  };
}

const toToolUsage = (dto: McpToolUsageDto): McpToolUsage => ({ ...toStats(dto), tool: dto.tool, toolName: dto.tool_name });

export function toServerUsage(dto: McpServerUsageDto): McpServerUsage {
  return { ...toStats(dto), server: dto.server, scopes: [...dto.scopes], projects: [...dto.projects], tools: dto.tools.map(toToolUsage) };
}

export function toMcpInvocationList(dto: McpInvocationListDto): McpInvocationList {
  return {
    items: dto.items.map(toMcpInvocation),
    servers: dto.servers.map(toServerUsage),
    unusedDeferred: dto.unused_deferred.map((u) => ({
      sessionId: u.session_id,
      toolName: u.tool_name,
      server: u.server,
      tool: u.tool,
      loadedAt: new Date(u.loaded_at),
    })),
    projects: [...dto.facets.projects],
    serverNames: [...dto.facets.servers],
  };
}
