import { SkillInvocationDto, SkillUsageDto } from '../mappers/skill-invocation.mapper';
import { SkillInvocation, SkillUsage } from '../models/skill-invocation';

export const SESSION_ID = '7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33';
const STARTED_AT = '2026-09-25T10:00:00.000Z';
const ENDED_AT = '2026-09-25T10:14:00.000Z';

export function skillInvocationDto(overrides: Partial<SkillInvocationDto> = {}): SkillInvocationDto {
  return {
    id: 'evt-1',
    event_id: 'evt-1',
    project: 'demo',
    directory: 'C:\\Codev\\demo',
    session_id: SESSION_ID,
    subagent_id: null,
    subagent_type: null,
    turn: 2,
    skill: 'grilling',
    args: 'Punto 1.6',
    invoker: 'agent',
    status: 'finished',
    started_at: STARTED_AT,
    ended_at: ENDED_AT,
    duration_ms: 840_000,
    error: null,
    ...overrides,
  };
}

export function skillInvocation(overrides: Partial<SkillInvocation> = {}): SkillInvocation {
  return {
    id: 'evt-1',
    eventId: 'evt-1',
    project: 'demo',
    directory: 'C:\\Codev\\demo',
    sessionId: SESSION_ID,
    subagentId: null,
    subagentType: null,
    turn: 2,
    skill: 'grilling',
    args: 'Punto 1.6',
    invoker: 'agent',
    status: 'finished',
    startedAt: new Date(STARTED_AT),
    endedAt: new Date(ENDED_AT),
    durationMs: 840_000,
    error: null,
    ...overrides,
  };
}

export function skillUsageDto(overrides: Partial<SkillUsageDto> = {}): SkillUsageDto {
  return {
    project: 'demo',
    skill: 'grilling',
    total: 1,
    by_invoker: { agent: 1, subagent: 0, user: 0 },
    last_at: STARTED_AT,
    ...overrides,
  };
}

export function skillUsage(overrides: Partial<SkillUsage> = {}): SkillUsage {
  return {
    project: 'demo',
    skill: 'grilling',
    total: 1,
    byInvoker: { agent: 1, subagent: 0, user: 0 },
    lastAt: new Date(STARTED_AT),
    ...overrides,
  };
}
