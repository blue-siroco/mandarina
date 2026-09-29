import { EventDto } from '../mappers/event.mapper';
import { ObservedEvent } from '../models/observed-event';

export function eventDto(overrides: Partial<EventDto> = {}): EventDto {
  return {
    id: 'evt-1',
    schema_version: 1,
    harness: 'claude-code',
    project: 'demo',
    directory: 'C:\\Codev\\demo',
    session_id: '7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33',
    subagent_id: null,
    event_type: 'tool.pre',
    native_event_type: 'PreToolUse',
    tool_name: 'Bash',
    occurred_at: '2026-09-25T10:00:00.000Z',
    received_at: '2026-09-25T10:00:00.100Z',
    transcript_path: null,
    payload: { tool_input: { command: 'npm test' } },
    block: null,
    subagent: null,
    warnings: [],
    ...overrides,
  };
}

export function observedEvent(overrides: Partial<ObservedEvent> = {}): ObservedEvent {
  return {
    id: 'evt-1',
    harness: 'claude-code',
    project: 'demo',
    directory: 'C:\\Codev\\demo',
    sessionId: '7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33',
    subagentId: null,
    eventType: 'tool.pre',
    nativeEventType: 'PreToolUse',
    toolName: 'Bash',
    occurredAt: new Date('2026-09-25T10:00:00.000Z'),
    receivedAt: new Date('2026-09-25T10:00:00.100Z'),
    transcriptPath: null,
    payload: {},
    block: null,
    subagent: null,
    warnings: [],
    ...overrides,
  };
}
