import { AgentLaunchDto, AgentProfileDto, AgentTypeSummaryDto } from '../mappers/agent.mapper';
import { AgentLaunch, AgentProfile, AgentTypeSummary } from '../models/agent';

export const SESSION_ID = '7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33';
const HAIKU = 'claude-haiku-4-5';
const STARTED_AT = '2026-09-25T10:00:00.000Z';
const STOPPED_AT = '2026-09-25T10:03:00.000Z';

export function agentSummaryDto(overrides: Partial<AgentTypeSummaryDto> = {}): AgentTypeSummaryDto {
  return {
    type: 'Explore',
    launches: 4,
    running: 1,
    no_response: 0,
    foreground: 3,
    background: 1,
    duration_p50_ms: 180_000,
    duration_p95_ms: 300_000,
    tokens: { input: 1000, output: 500, cache_read: 0, cache_creation: 0 },
    estimated_cost_usd: 0.04,
    cost_per_launch_usd: 0.01,
    tool_errors_per_launch: 0.5,
    blocks_per_launch: 0.25,
    cache_hit_rate: 0.9,
    cache_savings_net_usd: 0.12,
    rated_up: 0,
    rated_down: 0,
    sessions: 2,
    projects: ['demo'],
    last_at: STARTED_AT,
    ...overrides,
  };
}

export function agentSummary(overrides: Partial<AgentTypeSummary> = {}): AgentTypeSummary {
  return {
    type: 'Explore',
    launches: 4,
    running: 1,
    noResponse: 0,
    foreground: 3,
    background: 1,
    durationP50Ms: 180_000,
    durationP95Ms: 300_000,
    tokens: { input: 1000, output: 500, cacheRead: 0, cacheCreation: 0 },
    estimatedCostUsd: 0.04,
    costPerLaunchUsd: 0.01,
    toolErrorsPerLaunch: 0.5,
    blocksPerLaunch: 0.25,
    cacheHitRate: 0.9,
    cacheSavingsNetUsd: 0.12,
    ratedUp: 0,
    ratedDown: 0,
    sessions: 2,
    projects: ['demo'],
    lastAt: new Date(STARTED_AT),
    ...overrides,
  };
}

export function agentLaunchDto(overrides: Partial<AgentLaunchDto> = {}): AgentLaunchDto {
  return {
    session_id: SESSION_ID,
    project: 'demo',
    subagent_id: 'a1',
    tool_use_id: 't1',
    description: 'Explorar el repositorio',
    status: 'finished',
    background: false,
    started_at: STARTED_AT,
    stopped_at: STOPPED_AT,
    duration_ms: 180_000,
    tool_count: 4,
    tool_errors: 1,
    blocks: 0,
    model: HAIKU,
    tokens: { input: 1000, output: 500, cache_read: 0, cache_creation: 0 },
    estimated_cost_usd: 0.01,
    cache_hit_rate: 0.8,
    cache_savings_net_usd: 0.03,
    result: 'Encontrados 3 ficheros',
    ...overrides,
  };
}

export function agentLaunch(overrides: Partial<AgentLaunch> = {}): AgentLaunch {
  return {
    key: 'a1',
    sessionId: SESSION_ID,
    project: 'demo',
    subagentId: 'a1',
    toolUseId: 't1',
    description: 'Explorar el repositorio',
    status: 'finished',
    background: false,
    startedAt: new Date(STARTED_AT),
    stoppedAt: new Date(STOPPED_AT),
    durationMs: 180_000,
    toolCount: 4,
    toolErrors: 1,
    blocks: 0,
    model: HAIKU,
    tokens: { input: 1000, output: 500, cacheRead: 0, cacheCreation: 0 },
    estimatedCostUsd: 0.01,
    cacheHitRate: 0.8,
    cacheSavingsNetUsd: 0.03,
    result: 'Encontrados 3 ficheros',
    ...overrides,
  };
}

export function agentProfileDto(overrides: Partial<AgentProfileDto> = {}): AgentProfileDto {
  return {
    summary: agentSummaryDto(),
    launched_by: [{ launcher: null, launches: 4 }],
    models: [{ model: HAIKU, launches: 3 }],
    tools: [{ name: 'Read', calls: 10, errors: 1, blocks: 0 }],
    skills: [{ skill: 'tdd', invocations: 2 }],
    mcp_servers: [{ server: 'playwright', calls: 3, errors: 1 }],
    test_runs: { total: 2, passed: 1, failed: 1 },
    launches: [agentLaunchDto()],
    ...overrides,
  };
}

export function agentProfile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    summary: agentSummary(),
    launchedBy: [{ launcher: null, launches: 4 }],
    models: [{ model: HAIKU, launches: 3 }],
    tools: [{ name: 'Read', calls: 10, errors: 1, blocks: 0 }],
    skills: [{ skill: 'tdd', invocations: 2 }],
    mcpServers: [{ server: 'playwright', calls: 3, errors: 1 }],
    testRuns: { total: 2, passed: 1, failed: 1 },
    launches: [agentLaunch()],
    ...overrides,
  };
}
