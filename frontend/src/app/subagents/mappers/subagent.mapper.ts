import { TokenUsageDto, subagentKey, toTokenUsage } from '../../sessions/mappers/session.mapper';
import { SubagentItem, SubagentList, SubagentStatus } from '../models/subagent';

/** `SubagentListItem` de `spec/api-spec.yaml`. */
export interface SubagentItemDto {
  session_id: string;
  project: string;
  directory: string;
  subagent_id: string | null;
  tool_use_id: string | null;
  agent_type: string | null;
  description: string | null;
  internal: boolean;
  status: SubagentStatus;
  started_at: string;
  stopped_at: string | null;
  duration_ms: number;
  tool_count: number;
  model: string | null;
  tokens: TokenUsageDto | null;
  estimated_cost_usd: number | null;
}

/** Respuesta de `GET /api/v1/subagents`. */
export interface SubagentListDto {
  items: SubagentItemDto[];
  facets: { projects: string[]; types: string[] };
}

export function toSubagentItem(dto: SubagentItemDto): SubagentItem {
  return {
    key: subagentKey(dto.subagent_id, dto.tool_use_id),
    sessionId: dto.session_id,
    project: dto.project,
    directory: dto.directory,
    subagentId: dto.subagent_id,
    toolUseId: dto.tool_use_id,
    agentType: dto.agent_type,
    description: dto.description,
    internal: dto.internal,
    status: dto.status,
    startedAt: new Date(dto.started_at),
    stoppedAt: dto.stopped_at === null ? null : new Date(dto.stopped_at),
    durationMs: dto.duration_ms,
    toolCount: dto.tool_count,
    model: dto.model,
    tokens: dto.tokens && toTokenUsage(dto.tokens),
    estimatedCostUsd: dto.estimated_cost_usd,
  };
}

export function toSubagentList(dto: SubagentListDto): SubagentList {
  return {
    items: dto.items.map(toSubagentItem),
    projects: [...dto.facets.projects],
    types: [...dto.facets.types],
  };
}
