import { parseSubagentActivity, parseSubagentMeta, toolCallsFromEvents } from '../src/domain/subagent-activity.js';

const line = (record: object) => JSON.stringify(record);
const assistant = (timestamp: string, content: object[]) => line({ type: 'assistant', timestamp, message: { content } });
const toolResult = (id: string, isError = false) =>
  line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'x', is_error: isError }] } });

describe('AC-23: parseSubagentActivity', () => {
  const jsonl = [
    line({ type: 'user', message: { role: 'user', content: 'Busca los plugins de observabilidad' } }),
    assistant('2026-09-25T10:00:01.000Z', [{ type: 'text', text: 'Empiezo por el repo.' }]),
    assistant('2026-09-25T10:00:02.000Z', [{ type: 'tool_use', id: 't1', name: 'Grep', input: { pattern: 'observe' } }]),
    toolResult('t1'),
    assistant('2026-09-25T10:00:03.000Z', [{ type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/x.ts' } }]),
    toolResult('t2', true),
    assistant('2026-09-25T10:00:04.000Z', [{ type: 'tool_use', id: 't3', name: 'Bash', input: { command: 'ls' } }]),
    '{"type":"assistant","message":', // línea a medio escribir
  ].join('\n');

  it('extrae el prompt de la Tarea y las herramientas en orden con su resultado', () => {
    const activity = parseSubagentActivity(jsonl);
    expect(activity.prompt).toBe('Busca los plugins de observabilidad');
    expect(activity.tools).toStrictEqual([
      { name: 'Grep', summary: 'observe', started_at: '2026-09-25T10:00:02.000Z', status: 'ok' },
      { name: 'Read', summary: '/x.ts', started_at: '2026-09-25T10:00:03.000Z', status: 'error' },
      { name: 'Bash', summary: 'ls', started_at: '2026-09-25T10:00:04.000Z', status: 'running' },
    ]);
  });

  it('el texto intermedio anterior a una herramienta no es la respuesta', () => {
    expect(parseSubagentActivity(jsonl).result).toBeNull();
  });

  it('el último texto tras las herramientas es la respuesta', () => {
    const done = `${jsonl}\n${assistant('2026-09-25T10:00:09.000Z', [{ type: 'text', text: 'Hay 3 plugins.' }])}`;
    expect(parseSubagentActivity(done).result).toBe('Hay 3 plugins.');
  });

  it('un Transcript vacío no tiene Tarea ni herramientas', () => {
    expect(parseSubagentActivity('')).toStrictEqual({ prompt: null, tools: [], result: null });
  });
});

describe('AC-23: parseSubagentMeta', () => {
  it('AC-33: lee el tipo, la descripción de la Tarea y el lanzamiento', () => {
    expect(parseSubagentMeta('{"agentType":"Explore","description":"Buscar plugins","toolUseId":"t"}')).toStrictEqual({
      agentType: 'Explore',
      description: 'Buscar plugins',
      toolUseId: 't',
      background: false,
    });
  });

  it('un meta ilegible es null', () => {
    expect(parseSubagentMeta('{')).toBeNull();
  });
});

describe('AC-23: toolCallsFromEvents', () => {
  const ev = (event_type: string, occurred_at: string, payload: Record<string, unknown> = {}, tool_name = 'Bash') => ({
    event_type,
    tool_name,
    occurred_at,
    payload,
  });

  it('empareja por tool_use_id y marca error, Bloqueo y en curso', () => {
    const calls = toolCallsFromEvents([
      ev('tool.pre', '1', { tool_use_id: 'a', tool_input: { command: 'npm test' } }),
      ev('tool.pre', '2', { tool_use_id: 'b', tool_input: { command: 'npm run lint' } }),
      ev('tool.post', '3', { tool_use_id: 'a', tool_response: { is_error: true } }),
      ev('tool.post', '4', { tool_use_id: 'b', tool_response: { stdout: 'ok' } }),
      ev('tool.blocked', '5', { tool_input: { command: 'rm -rf /' } }),
      ev('tool.pre', '6', { tool_input: { command: 'sleep 9' } }),
      ev('subagent.stopped', '7'),
    ]);
    expect(calls.map((c) => [c.summary, c.status])).toStrictEqual([
      ['npm test', 'error'],
      ['npm run lint', 'ok'],
      ['rm -rf /', 'blocked'],
      ['sleep 9', 'running'],
    ]);
  });

  it('sin tool_use_id cierra la última abierta', () => {
    const calls = toolCallsFromEvents([ev('tool.pre', '1'), ev('tool.post', '2')]);
    expect(calls.map((c) => c.status)).toStrictEqual(['ok']);
  });

  it('AC-25: un tool.post de PostToolUseFailure (con `error`) es una herramienta con error', () => {
    const calls = toolCallsFromEvents([
      ev('tool.pre', '1', { tool_use_id: 'a' }),
      ev('tool.post', '2', { tool_use_id: 'a', hook_event_name: 'PostToolUseFailure', error: 'Exit code 1' }),
    ]);
    expect(calls.map((c) => c.status)).toStrictEqual(['error']);
  });
});
