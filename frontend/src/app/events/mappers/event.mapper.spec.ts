import { eventDto } from '../testing/event-fixtures';
import { toObservedEvent } from './event.mapper';

describe('AC-09: toObservedEvent', () => {
  it('traduce el DTO de la API al modelo de la UI', () => {
    const dto = eventDto({ subagent_id: 'agent-1', transcript_path: '/home/demo/.claude/t.jsonl' });

    expect(toObservedEvent(dto)).toStrictEqual({
      id: 'evt-1',
      harness: 'claude-code',
      project: 'demo',
      directory: 'C:\\Codev\\demo',
      sessionId: '7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33',
      subagentId: 'agent-1',
      eventType: 'tool.pre',
      nativeEventType: 'PreToolUse',
      toolName: 'Bash',
      occurredAt: new Date('2026-09-25T10:00:00.000Z'),
      receivedAt: new Date('2026-09-25T10:00:00.100Z'),
      transcriptPath: '/home/demo/.claude/t.jsonl',
      payload: { tool_input: { command: 'npm test' } },
      block: null,
      subagent: null,
      warnings: [],
    });
  });
});

describe('AC-22: toObservedEvent con Bloqueos', () => {
  it('conserva la Regla y el motivo de un Evento tool.blocked', () => {
    const dto = eventDto({ event_type: 'tool.blocked', block: { rule: 'dangerous-rm', reason: 'rm -rf /' } });

    expect(toObservedEvent(dto).block).toStrictEqual({ rule: 'dangerous-rm', reason: 'rm -rf /' });
  });

  it('acepta un backend anterior que no envía block', () => {
    const legacy = eventDto();
    delete legacy.block;

    expect(toObservedEvent(legacy).block).toBeNull();
  });
});

describe('AC-36: toObservedEvent con Subagente', () => {
  it('traduce los datos del Subagente de un Evento subagent.*', () => {
    const dto = eventDto({
      event_type: 'subagent.stopped',
      subagent: { type: 'Explore', description: 'Explorar', duration_ms: 60_000, internal: false },
    });
    expect(toObservedEvent(dto).subagent).toStrictEqual({ type: 'Explore', description: 'Explorar', durationMs: 60_000, internal: false });
  });

  it('acepta un backend anterior que no envía subagent', () => {
    const legacy = eventDto();
    delete legacy.subagent;
    expect(toObservedEvent(legacy).subagent).toBeNull();
  });
});

describe('AC-64: toObservedEvent con Avisos de inyección', () => {
  it('traduce los avisos del Evento', () => {
    const dto = eventDto({
      event_type: 'tool.post',
      warnings: [
        { id: 'evt-1:fake-system-tag', pattern: 'fake-system-tag', severity: 'high', dismissed: false },
        { id: 'evt-1:ignore-previous', pattern: 'ignore-previous', severity: 'medium', dismissed: true },
      ],
    });
    expect(toObservedEvent(dto).warnings).toStrictEqual([
      { id: 'evt-1:fake-system-tag', pattern: 'fake-system-tag', severity: 'high', dismissed: false },
      { id: 'evt-1:ignore-previous', pattern: 'ignore-previous', severity: 'medium', dismissed: true },
    ]);
  });

  it('acepta un backend anterior que no envía warnings', () => {
    const legacy = eventDto();
    delete legacy.warnings;
    expect(toObservedEvent(legacy).warnings).toStrictEqual([]);
  });
});
