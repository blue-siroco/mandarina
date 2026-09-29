import { SessionDetailDto, SessionSummaryDto } from '../mappers/session.mapper';
import { SessionDetail, SessionSummary } from '../models/session';

export const SESSION_ID = '7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33';

const DIRECTORY = 'C:\\Codev\\demo';
const OPUS = 'claude-opus-5-5';
const HAIKU = 'claude-haiku-4-5';
const SUBAGENT = 'agent-9a8b7c';
const TASK = 'Buscar plugins';
const LAST_EVENT = '2026-09-25T10:10:00.000Z';

export function sessionSummaryDto(overrides: Partial<SessionSummaryDto> = {}): SessionSummaryDto {
  return {
    session_id: SESSION_ID,
    project: 'demo',
    directory: DIRECTORY,
    harness: 'claude-code',
    state: 'active',
    activity: 'working',
    current_tool: { name: 'Bash', summary: 'npm test' },
    model: OPUS,
    started_at: '2026-09-25T09:00:00.000Z',
    last_event_at: LAST_EVENT,
    last_activity_at: LAST_EVENT,
    event_count: 120,
    tool_count: 40,
    prompt_count: 5,
    turn_count: 5,
    subagent_count: 2,
    running_subagents: 1,
    live_subagents: [
      { subagent_id: SUBAGENT, agent_type: 'Explore', description: TASK, current_tool: { name: 'Grep', summary: 'TODO' } },
    ],
    block_count: 1,
    evaluation_score: null,
    injection_alerts: 0,
    budget_stopped: false,
    active_duration_ms: 42 * 60_000,
    clock_duration_ms: 70 * 60_000,
    sparkline: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    ...overrides,
  };
}

export function sessionSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: SESSION_ID,
    project: 'demo',
    directory: DIRECTORY,
    harness: 'claude-code',
    state: 'active',
    activity: 'working',
    currentTool: { name: 'Bash', summary: 'npm test' },
    model: OPUS,
    startedAt: new Date('2026-09-25T09:00:00.000Z'),
    lastEventAt: new Date(LAST_EVENT),
    lastActivityAt: new Date(LAST_EVENT),
    eventCount: 120,
    toolCount: 40,
    promptCount: 5,
    turnCount: 5,
    subagentCount: 2,
    runningSubagents: 1,
    liveSubagents: [
      { subagentId: SUBAGENT, agentType: 'Explore', description: TASK, currentTool: { name: 'Grep', summary: 'TODO' } },
    ],
    blockCount: 1,
    evaluationScore: null,
    injectionAlerts: 0,
    budgetStopped: false,
    activeDurationMs: 42 * 60_000,
    clockDurationMs: 70 * 60_000,
    sparkline: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    ...overrides,
  };
}

export function sessionDetailDto(overrides: Partial<SessionDetailDto> = {}): SessionDetailDto {
  return {
    ...sessionSummaryDto(),
    transcript_available: true,
    cache: null,
    cache_rewrites: [],
    usage: {
      tokens: { input: 1200, output: 45_000, cache_read: 4_700_000, cache_creation: 240_000 },
      estimated_cost_usd: 3.4212,
      requests: 48,
      models: [OPUS],
    },
    context: { model: OPUS, used: 91_900, limit: 1_000_000 },
    tools: [
      { name: 'Bash', count: 20 },
      { name: 'Read', count: 10 },
    ],
    turns: [
      {
        id: 'prompt-1',
        index: 1,
        started_at: '2026-09-25T09:10:00.000Z',
        ended_at: '2026-09-25T09:20:00.000Z',
        duration_ms: 600_000,
        prompt: 'Añade un test',
        tool_count: 8,
      },
      { id: 'prompt-2', index: 2, started_at: '2026-09-25T10:00:00.000Z', ended_at: null, duration_ms: 600_000, prompt: null, tool_count: 3 },
    ],
    subagents: [
      {
        subagent_id: SUBAGENT,
        tool_use_id: 'toolu_01',
        internal: false,
        agent_type: 'Explore',
        started_at: '2026-09-25T09:12:00.000Z',
        stopped_at: '2026-09-25T09:15:00.000Z',
        duration_ms: 180_000,
        tool_count: 6,
        model: HAIKU,
        tokens: { input: 500, output: 900, cache_read: 0, cache_creation: 0 },
        task: { description: TASK, prompt: 'Busca los plugins de observabilidad' },
        tools: [
          { name: 'Grep', summary: 'observe', started_at: '2026-09-25T09:13:00.000Z', status: 'ok' },
          { name: 'Read', summary: 'a.ts', started_at: '2026-09-25T09:14:00.000Z', status: 'error' },
        ],
        result: 'Hay 3 plugins.',
      },
    ],
    blocks: [
      {
        event_id: 'blk-1',
        occurred_at: '2026-09-25T09:30:00.000Z',
        subagent_id: null,
        tool_name: 'Bash',
        summary: 'rm -rf /',
        rule: 'dangerous-rm',
        reason: 'Borrado fuera del Directorio',
      },
    ],
    ...overrides,
  };
}

export function sessionDetail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    ...sessionSummary(),
    transcriptAvailable: true,
    cache: null,
    cacheRewrites: [],
    usage: {
      tokens: { input: 1200, output: 45_000, cacheRead: 4_700_000, cacheCreation: 240_000 },
      estimatedCostUsd: 3.4212,
      requests: 48,
      models: [OPUS],
    },
    context: { model: OPUS, used: 91_900, limit: 1_000_000 },
    tools: [
      { name: 'Bash', count: 20 },
      { name: 'Read', count: 10 },
    ],
    turns: [
      {
        id: 'prompt-1',
        index: 1,
        startedAt: new Date('2026-09-25T09:10:00.000Z'),
        endedAt: new Date('2026-09-25T09:20:00.000Z'),
        durationMs: 600_000,
        prompt: 'Añade un test',
        toolCount: 8,
      },
      {
        id: 'prompt-2',
        index: 2,
        startedAt: new Date('2026-09-25T10:00:00.000Z'),
        endedAt: null,
        durationMs: 600_000,
        prompt: null,
        toolCount: 3,
      },
    ],
    subagents: [
      {
        key: SUBAGENT,
        subagentId: SUBAGENT,
        toolUseId: 'toolu_01',
        agentType: 'Explore',
        internal: false,
        startedAt: new Date('2026-09-25T09:12:00.000Z'),
        stoppedAt: new Date('2026-09-25T09:15:00.000Z'),
        durationMs: 180_000,
        toolCount: 6,
        model: HAIKU,
        tokens: { input: 500, output: 900, cacheRead: 0, cacheCreation: 0 },
        task: { description: TASK, prompt: 'Busca los plugins de observabilidad' },
        tools: [
          { name: 'Grep', summary: 'observe', startedAt: new Date('2026-09-25T09:13:00.000Z'), status: 'ok' },
          { name: 'Read', summary: 'a.ts', startedAt: new Date('2026-09-25T09:14:00.000Z'), status: 'error' },
        ],
        result: 'Hay 3 plugins.',
      },
    ],
    blocks: [
      {
        eventId: 'blk-1',
        occurredAt: new Date('2026-09-25T09:30:00.000Z'),
        subagentId: null,
        toolName: 'Bash',
        summary: 'rm -rf /',
        rule: 'dangerous-rm',
        reason: 'Borrado fuera del Directorio',
      },
    ],
    ...overrides,
  };
}
