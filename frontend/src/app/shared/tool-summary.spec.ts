import { isMcpTool, oneLine, summarizeToolInput, toolLabel } from './tool-summary';

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
