import type { StoredEvent } from '../src/domain/event.js';
import { downloadFields, downloadWindow, toDownloadedEvent } from '../src/domain/download-events.js';
import { redactSessionDetail } from '../src/domain/download-session.js';

const event: StoredEvent = {
  schema_version: 1,
  id: 'e1',
  harness: 'claude-code',
  project: 'demo',
  directory: '/code/demo',
  session_id: 's1',
  subagent_id: null,
  event_type: 'tool.blocked',
  native_event_type: 'PreToolUse',
  tool_name: 'Bash',
  occurred_at: '2026-09-25T12:00:00.000Z',
  received_at: '2026-09-25T12:00:00.100Z',
  transcript_path: '/home/dev/.claude/projects/demo/s1.jsonl',
  payload: { tool_input: { command: 'echo GITHUB_TOKEN=ghp_abcdefghijklmnopqrstu' } },
  block: { rule: 'secret-in-command', reason: 'Lleva la clave sk-ant-api03-abcdefghijklmnop' },
};

describe('AC-142: un Evento descargado sin contenido lleva solo estructura', () => {
  it('no tiene payload ni block.reason (las claves no aparecen) ni transcript_path', () => {
    const out = toDownloadedEvent(event, false);
    expect(out).toStrictEqual({
      id: 'e1',
      harness: 'claude-code',
      project: 'demo',
      directory: '/code/demo',
      session_id: 's1',
      subagent_id: null,
      event_type: 'tool.blocked',
      native_event_type: 'PreToolUse',
      tool_name: 'Bash',
      occurred_at: '2026-09-25T12:00:00.000Z',
      received_at: '2026-09-25T12:00:00.100Z',
      block: { rule: 'secret-in-command' },
    });
    expect('payload' in out).toBe(false);
  });

  it('un Evento sin Bloqueo lleva block null', () => {
    expect(toDownloadedEvent({ ...event, block: null }, false).block).toBeNull();
  });
});

describe('AC-143: con contenido, el payload y el motivo salen siempre enmascarados', () => {
  it('enmascara aunque el Evento guardado trajera el secreto en claro (doble red)', () => {
    const out = toDownloadedEvent(event, true);
    const text = JSON.stringify(out);
    expect(text).not.toContain('ghp_');
    expect(text).not.toContain('sk-ant-api03');
    expect(out.block).toStrictEqual({ rule: 'secret-in-command', reason: 'Lleva la clave [REDACTED_API_KEY]' });
    expect(out.payload).toStrictEqual({ tool_input: { command: 'echo GITHUB_TOKEN=[REDACTED_API_KEY]' } });
  });

  it('un texto ya enmascarado no cambia', () => {
    const payload = { prompt: 'usa [REDACTED_API_KEY]' };
    expect(toDownloadedEvent({ ...event, payload }, true).payload).toStrictEqual(payload);
  });
});

describe('AC-145: ventana y campos de una descarga', () => {
  it('dentro del tope no se trunca', () => {
    expect(downloadWindow(3, 5)).toStrictEqual({ total: 3, exported: 3, truncated: false, omitted: 0 });
    expect(downloadWindow(5, 5)).toStrictEqual({ total: 5, exported: 5, truncated: false, omitted: 0 });
  });

  it('por encima del tope se exporta el tope y se omite el resto', () => {
    expect(downloadWindow(8, 5)).toStrictEqual({ total: 8, exported: 5, truncated: true, omitted: 3 });
  });

  it('los campos dependen de content', () => {
    expect(downloadFields(false)).toContain('block.rule');
    expect(downloadFields(false)).not.toContain('payload');
    expect(downloadFields(false)).not.toContain('block.reason');
    expect(downloadFields(true)).toEqual(expect.arrayContaining(['payload', 'block.reason', 'block.rule', 'tool_name']));
  });
});

describe('AC-142/AC-143: redacción del detalle de Sesión', () => {
  const detail = {
    session_id: 's1',
    current_tool: { name: 'Bash', summary: 'ls' },
    waiting: { reason: 'permission', tool: 'Bash', summary: 'rm -rf x' },
    live_subagents: [{ subagent_id: 'a', description: 'Buscar', current_tool: { name: 'Read', summary: 'a.ts' } }],
    turns: [{ id: 't', index: 1, prompt: 'hola sk-ant-api03-abcdefghijklmnop', tool_count: 2 }],
    subagents: [
      {
        subagent_id: 'a',
        task: { description: 'd', prompt: 'p' },
        result: 'r',
        tools: [{ name: 'Read', summary: 'a.ts', status: 'ok' }],
        tool_count: 1,
      },
    ],
    blocks: [{ event_id: 'e1', summary: 'echo x', rule: 'r', reason: 'motivo' }],
  };

  it('sin contenido quita las claves de texto libre en lugar de dejarlas vacías', () => {
    const out = redactSessionDetail(detail, false) as any;
    expect('prompt' in out.turns[0]).toBe(false);
    expect('task' in out.subagents[0]).toBe(false);
    expect('result' in out.subagents[0]).toBe(false);
    expect('summary' in out.subagents[0].tools[0]).toBe(false);
    expect('summary' in out.blocks[0]).toBe(false);
    expect('summary' in out.current_tool).toBe(false);
    expect('summary' in out.waiting).toBe(false);
    expect('description' in out.live_subagents[0]).toBe(false);
    expect(out.turns[0]).toStrictEqual({ id: 't', index: 1, tool_count: 2 });
    expect(out.subagents[0].tools[0]).toStrictEqual({ name: 'Read', status: 'ok' });
  });

  it('con contenido lo conserva, enmascarado', () => {
    const out = redactSessionDetail(detail, true) as any;
    expect(out.turns[0].prompt).toBe('hola [REDACTED_API_KEY]');
    expect(out.subagents[0].result).toBe('r');
  });
});
