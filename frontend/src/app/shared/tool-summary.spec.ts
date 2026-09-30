import { isMcpTool, oneLine, summarizeToolInput, summarizeToolOutput, toolLabel } from './tool-summary';

describe('AC-15, AC-22, AC-31: summarizeToolInput', () => {
  it.each([
    ['Bash', { command: 'npm test\nnpm run lint' }, 'npm test'],
    ['Read', { file_path: '/code/a.ts' }, '/code/a.ts'],
    ['Grep', { pattern: 'TODO', path: 'src' }, 'TODO'],
    ['Task', { description: 'Explorar', prompt: '…' }, 'Explorar'],
    ['Skill', { args: 'Punto 1.6', skill: 'grilling' }, 'grilling'],
    ['mcp__x__y', { query: 'algo' }, 'algo'],
  ])('%s', (tool, input, expected) => {
    expect(summarizeToolInput(tool, { tool_input: input })).toBe(expected);
  });

  it('sin entrada devuelve null', () => {
    expect(summarizeToolInput('Bash', {})).toBeNull();
    expect(summarizeToolInput('Bash', { tool_input: { timeout: 3 } })).toBeNull();
  });

  it('recorta a una línea de 80 caracteres', () => {
    const line = oneLine('x'.repeat(200));
    expect(line).toHaveLength(80);
    expect(line.endsWith('…')).toBe(true);
  });
});

describe('AC-43: toolLabel', () => {
  it.each([
    ['mcp__playwright__browser_navigate', 'playwright · browser_navigate'],
    ['mcp__claude_ai_Claude_Docs__batch', 'claude_ai_Claude_Docs · batch'],
    ['Bash', 'Bash'],
    ['mcp__roto', 'mcp__roto'],
  ])('%s se nombra %s', (name, label) => {
    expect(toolLabel(name)).toBe(label);
  });

  it.each([
    ['mcp__playwright__browser_click', true],
    ['ReadMcpResourceTool', true],
    ['ListMcpResourcesTool', true],
    ['Bash', false],
    [null, false],
  ])('%s es MCP: %s', (name, expected) => {
    expect(isMcpTool(name)).toBe(expected);
  });
});

describe('AC-113: summarizeToolOutput', () => {
  const out = (tool: string, payload: Record<string, unknown>) => summarizeToolOutput(tool, payload);

  it('Bash: primera línea no vacía de stdout', () => {
    expect(out('Bash', { tool_response: { stdout: '\n  Tests 12 passed\nsegunda', stderr: '' } })).toBe('Tests 12 passed');
  });

  it('Bash: sin stdout usa stderr, y sin nada dice el código de salida', () => {
    expect(out('Bash', { tool_response: { stdout: '', stderr: 'warning: x' } })).toBe('warning: x');
    expect(out('Bash', { tool_response: { stdout: '', stderr: '' } })).toBe('exit 0');
    expect(out('Bash', { tool_response: { stdout: '', exit_code: 2 } })).toBe('exit 2');
    expect(out('Bash', { tool_response: { stdout: '', interrupted: true } })).toBe('interrumpido');
  });

  it('Read: número de líneas', () => {
    expect(out('Read', { tool_response: { type: 'text', file: { filePath: '/a.ts', numLines: 120 } } })).toBe('120 líneas');
    expect(out('Read', { tool_response: { file: { numLines: 1 } } })).toBe('1 línea');
    expect(out('Read', { tool_response: { file: { content: 'a\nb\nc' } } })).toBe('3 líneas');
  });

  it('Grep y Glob: número de archivos', () => {
    expect(out('Grep', { tool_response: { numFiles: 4 } })).toBe('4 archivos');
    expect(out('Glob', { tool_response: { numFiles: 1 } })).toBe('1 archivo');
  });

  it('el error manda sobre la respuesta y se recorta a una línea', () => {
    expect(out('Bash', { error: 'Exit code 1\nnpm ERR! missing script: build' })).toBe('Exit code 1 · npm ERR! missing script: build');
    expect(out('Read', { error: 'File not found\nmás detalle' })).toBe('File not found');
    expect(out('Bash', { error: 'x'.repeat(200) })).toHaveLength(80);
  });

  it('otras herramientas: respuesta en texto o bloques de texto (MCP)', () => {
    expect(out('WebFetch', { tool_response: '# Título\ncuerpo' })).toBe('# Título');
    expect(out('mcp__x__y', { tool_response: [{ type: 'text', text: 'hecho' }] })).toBe('hecho');
  });

  it('sin respuesta interpretable no devuelve nada', () => {
    expect(out('Skill', { tool_response: { success: true, commandName: 'grilling' } })).toBeNull();
    expect(out('Bash', {})).toBeNull();
    expect(out('Edit', { tool_response: { filePath: '/a' } })).toBeNull();
  });
});
