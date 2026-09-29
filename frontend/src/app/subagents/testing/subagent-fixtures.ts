import { SubagentItemDto } from '../mappers/subagent.mapper';
import { SubagentItem } from '../models/subagent';

export const SESSION_ID = '7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33';
const STARTED_AT = '2026-09-25T10:00:00.000Z';
const STOPPED_AT = '2026-09-25T10:03:00.000Z';

export function subagentItemDto(overrides: Partial<SubagentItemDto> = {}): SubagentItemDto {
  return {
    session_id: SESSION_ID,
    project: 'demo',
    directory: 'C:\\Codev\\demo',
    subagent_id: 'a1',
    tool_use_id: 'toolu_01',
    agent_type: 'Explore',
    description: 'Explorar el repositorio',
    internal: false,
    status: 'finished',
    started_at: STARTED_AT,
    stopped_at: STOPPED_AT,
    duration_ms: 180_000,
    tool_count: 4,
    model: 'claude-haiku-4-5',
    tokens: { input: 1000, output: 500, cache_read: 0, cache_creation: 0 },
    estimated_cost_usd: 0.0035,
    ...overrides,
  };
}

export function subagentItem(overrides: Partial<SubagentItem> = {}): SubagentItem {
  return {
    key: 'a1',
    sessionId: SESSION_ID,
    project: 'demo',
    directory: 'C:\\Codev\\demo',
    subagentId: 'a1',
    toolUseId: 'toolu_01',
    agentType: 'Explore',
    description: 'Explorar el repositorio',
    internal: false,
    status: 'finished',
    startedAt: new Date(STARTED_AT),
    stoppedAt: new Date(STOPPED_AT),
    durationMs: 180_000,
    toolCount: 4,
    model: 'claude-haiku-4-5',
    tokens: { input: 1000, output: 500, cacheRead: 0, cacheCreation: 0 },
    estimatedCostUsd: 0.0035,
    ...overrides,
  };
}
