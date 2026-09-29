import { McpInvocationDto, McpServerUsageDto } from '../mappers/mcp.mapper';
import { McpInvocation, McpServerUsage, McpToolUsage } from '../models/mcp';

export const SESSION_ID = '7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33';
const NAVIGATE = 'mcp__playwright__browser_navigate';
const STARTED_AT = '2026-09-25T10:00:00.000Z';
const ENDED_AT = '2026-09-25T10:00:00.850Z';

export function mcpInvocationDto(overrides: Partial<McpInvocationDto> = {}): McpInvocationDto {
  return {
    id: 'evt-1',
    event_id: 'evt-1',
    project: 'demo',
    directory: 'C:\\Codev\\demo',
    session_id: SESSION_ID,
    subagent_id: null,
    server: 'playwright',
    scope: 'project',
    tool: 'browser_navigate',
    tool_name: NAVIGATE,
    summary: 'http://localhost:4200',
    status: 'ok',
    started_at: STARTED_AT,
    ended_at: ENDED_AT,
    duration_ms: 850,
    response_bytes: 2048,
    has_image: false,
    error: null,
    ...overrides,
  };
}

export function mcpInvocation(overrides: Partial<McpInvocation> = {}): McpInvocation {
  return {
    id: 'evt-1',
    eventId: 'evt-1',
    project: 'demo',
    directory: 'C:\\Codev\\demo',
    sessionId: SESSION_ID,
    subagentId: null,
    server: 'playwright',
    scope: 'project',
    tool: 'browser_navigate',
    toolName: NAVIGATE,
    summary: 'http://localhost:4200',
    status: 'ok',
    startedAt: new Date(STARTED_AT),
    endedAt: new Date(ENDED_AT),
    durationMs: 850,
    responseBytes: 2048,
    hasImage: false,
    error: null,
    ...overrides,
  };
}

const statsDto = {
  calls: 4,
  ok: 2,
  errors: 1,
  interrupted: 1,
  blocked: 0,
  running: 0,
  no_response: 0,
  failure_rate: 1 / 3,
  latency_p50_ms: 850,
  latency_p95_ms: 2500,
  response_avg_bytes: 2048,
  response_max_bytes: 120_000,
  has_image: true,
  last_at: STARTED_AT,
  sessions: 2,
};

const stats = {
  calls: 4,
  ok: 2,
  errors: 1,
  interrupted: 1,
  blocked: 0,
  running: 0,
  noResponse: 0,
  failureRate: 1 / 3,
  latencyP50Ms: 850,
  latencyP95Ms: 2500,
  responseAvgBytes: 2048,
  responseMaxBytes: 120_000,
  hasImage: true,
  lastAt: new Date(STARTED_AT),
  sessions: 2,
};

export function mcpServerUsageDto(overrides: Partial<McpServerUsageDto> = {}): McpServerUsageDto {
  return {
    ...statsDto,
    server: 'playwright',
    scopes: ['project'],
    projects: ['demo'],
    tools: [{ ...statsDto, tool: 'browser_navigate', tool_name: NAVIGATE }],
    ...overrides,
  };
}

export function mcpToolUsage(overrides: Partial<McpToolUsage> = {}): McpToolUsage {
  return { ...stats, tool: 'browser_navigate', toolName: NAVIGATE, ...overrides };
}

export function mcpServerUsage(overrides: Partial<McpServerUsage> = {}): McpServerUsage {
  return { ...stats, server: 'playwright', scopes: ['project'], projects: ['demo'], tools: [mcpToolUsage()], ...overrides };
}
