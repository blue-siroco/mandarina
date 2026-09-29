import { TestRunDto } from '../mappers/test-run.mapper';
import { TestRun } from '../models/test-run';

export function testRunDto(overrides: Partial<TestRunDto> = {}): TestRunDto {
  return {
    id: 'evt-1:vitest',
    event_id: 'evt-1',
    project: 'demo',
    directory: 'C:\\Codev\\demo',
    session_id: '7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33',
    subagent_id: null,
    kind: 'unit',
    runner: 'vitest',
    command: 'npx vitest run',
    status: 'failed',
    counts: { total: 10, passed: 8, failed: 1, skipped: 1 },
    duration_ms: 1230,
    finished_at: '2026-09-25T10:00:00.000Z',
    failures: [{ name: 'sum > AC-01: suma', file: 'test/sum.test.ts', message: 'AssertionError: expected 3 to be 4', ac: 'AC-01' }],
    ...overrides,
  };
}

export function testRun(overrides: Partial<TestRun> = {}): TestRun {
  return {
    id: 'evt-1:vitest',
    eventId: 'evt-1',
    project: 'demo',
    directory: 'C:\\Codev\\demo',
    sessionId: '7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33',
    subagentId: null,
    kind: 'unit',
    runner: 'vitest',
    command: 'npx vitest run',
    status: 'failed',
    counts: { total: 10, passed: 8, failed: 1, skipped: 1 },
    durationMs: 1230,
    finishedAt: new Date('2026-09-25T10:00:00.000Z'),
    failures: [{ name: 'sum > AC-01: suma', file: 'test/sum.test.ts', message: 'AssertionError: expected 3 to be 4', ac: 'AC-01' }],
    ...overrides,
  };
}
