import type { EventType } from '../src/domain/event.js';
import {
  digestOf,
  mcpInvocationsOfSession,
  mcpUsage,
  serverOf,
  type McpEventRow,
  type McpInvocation,
} from '../src/domain/mcp-invocations.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const at = (minutesAgo: number, seconds = 0) => new Date(NOW.getTime() - minutesAgo * 60_000 + seconds * 1000).toISOString();

let seq = 0;
function row(eventType: EventType, minutesAgo: number, overrides: Partial<McpEventRow> = {}): McpEventRow {
  seq += 1;
  return {
    id: `e${seq}`,
    session_id: 's1',
    project: 'demo',
    directory: '/code/demo',
    harness: 'claude-code',
    subagent_id: null,
    event_type: eventType,
    tool_name: null,
    occurred_at: at(minutesAgo),
    received_at: at(minutesAgo),
    transcript_path: null,
    ...overrides,
  };
}

const NAVIGATE = 'mcp__playwright__browser_navigate';
const SCREENSHOT = 'mcp__playwright__browser_take_screenshot';

// Eventos reales de Claude Code con Playwright MCP, recortados.
const pre = (minutesAgo: number, tool: string, toolUseId: string, input: Record<string, unknown> = { url: 'http://localhost:4200' }, extra: Partial<McpEventRow> = {}) =>
  row('tool.pre', minutesAgo, {
    tool_name: tool,
    payload: { tool_name: tool, tool_input: input, tool_use_id: toolUseId, mcp_server: { name: 'playwright', source: 'project' } },
    ...extra,
  });
const post = (minutesAgo: number, tool: string, toolUseId: string, response: unknown = [{ type: 'text', text: 'ok' }], extra: Record<string, unknown> = {}) =>
  row('tool.post', minutesAgo, {
    tool_name: tool,
    digest: digestOf({ tool_use_id: toolUseId, tool_response: response, duration_ms: 1042, ...extra }),
  });
const failure = (minutesAgo: number, tool: string, toolUseId: string, error: string, isInterrupt = false) =>
  row('tool.post', minutesAgo, { tool_name: tool, digest: digestOf({ tool_use_id: toolUseId, error, is_interrupt: isInterrupt }) });

const only = (items: McpInvocation[]) => {
  expect(items).toHaveLength(1);
  return items[0]!;
};

describe('AC-41: servidor de una Herramienta MCP', () => {
  it.each([
    ['mcp__playwright__browser_navigate', { server: 'playwright', tool: 'browser_navigate' }],
    ['mcp__claude_ai_Claude_Docs__batch', { server: 'claude_ai_Claude_Docs', tool: 'batch' }],
    ['Bash', null],
    ['mcp__roto', null],
  ])('%s', (toolName, expected) => {
    expect(serverOf(toolName)).toStrictEqual(expected);
  });
});

describe('AC-41: resumen de la respuesta', () => {
  it('mide los bytes de la respuesta y detecta imágenes', () => {
    const image = [{ type: 'text', text: 'captura' }, { type: 'image', source: { data: 'á'.repeat(10) } }];
    const digest = digestOf({ tool_use_id: 't1', tool_response: image, duration_ms: 12 });
    expect(digest).toMatchObject({ tool_use_id: 't1', duration_ms: 12, has_image: true, is_interrupt: false, error: null });
    expect(digest.response_bytes).toBe(Buffer.byteLength(JSON.stringify(image)));
  });

  it('sin respuesta no mide nada, y un error se queda en su primera línea', () => {
    expect(digestOf({ tool_use_id: 't1', error: 'Timeout\nstack', is_interrupt: true })).toMatchObject({
      response_bytes: null,
      has_image: false,
      error: 'Timeout',
      is_interrupt: true,
    });
  });
});

describe('AC-41: invocaciones de una Sesión', () => {
  it('enlaza el tool.pre con su tool.post y lee servidor, ámbito, latencia y tamaño', () => {
    const events = [row('prompt.submitted', 10), pre(9, NAVIGATE, 't1'), post(9, NAVIGATE, 't1'), row('turn.ended', 8)];
    expect(only(mcpInvocationsOfSession(events, NOW))).toMatchObject({
      id: events[1]!.id,
      server: 'playwright',
      scope: 'project',
      tool: 'browser_navigate',
      tool_name: NAVIGATE,
      summary: 'http://localhost:4200',
      status: 'ok',
      started_at: at(9),
      ended_at: at(9),
      duration_ms: 1042,
      has_image: false,
      subagent_id: null,
    });
  });

  it('sin duration_ms usa la diferencia entre tool.pre y tool.post', () => {
    const events = [pre(9, NAVIGATE, 't1'), row('tool.post', 9, { tool_name: NAVIGATE, occurred_at: at(9, 3), digest: digestOf({ tool_use_id: 't1', tool_response: 'ok' }) })];
    expect(only(mcpInvocationsOfSession(events, NOW)).duration_ms).toBe(3000);
  });

  it.each([
    ['un fallo es error', failure(8, NAVIGATE, 't1', 'net::ERR_CONNECTION_REFUSED\nat …'), 'error', 'net::ERR_CONNECTION_REFUSED'],
    ['una interrupción con Esc no es un fallo', failure(8, NAVIGATE, 't1', 'Interrupted by user', true), 'interrupted', 'Interrupted by user'],
  ])('%s', (_name, end, status, error) => {
    expect(only(mcpInvocationsOfSession([pre(9, NAVIGATE, 't1'), end], NOW))).toMatchObject({ status, error });
  });

  it('una bloqueada no espera respuesta', () => {
    const blocked = row('tool.blocked', 9, { tool_name: NAVIGATE, payload: { tool_input: { url: 'file:///etc/passwd' }, tool_use_id: 't1' } });
    expect(only(mcpInvocationsOfSession([blocked], NOW))).toMatchObject({ status: 'blocked', scope: null, server: 'playwright' });
  });

  it('sin tool.post está en curso mientras dura su Turno y sin respuesta cuando termina', () => {
    expect(only(mcpInvocationsOfSession([row('prompt.submitted', 3), pre(2, SCREENSHOT, 't1')], NOW)).status).toBe('running');
    expect(only(mcpInvocationsOfSession([row('prompt.submitted', 3), pre(2, SCREENSHOT, 't1'), row('turn.ended', 1)], NOW)).status).toBe('no_response');
    expect(only(mcpInvocationsOfSession([pre(60, SCREENSHOT, 't1')], NOW)).status).toBe('no_response');
  });

  it('una de un Subagente queda sin respuesta cuando el Subagente termina', () => {
    const events = [
      row('prompt.submitted', 5),
      pre(4, NAVIGATE, 't1', {}, { subagent_id: 'a1' }),
      row('subagent.stopped', 3, { subagent_id: 'a1' }),
    ];
    expect(only(mcpInvocationsOfSession(events, NOW))).toMatchObject({ subagent_id: 'a1', status: 'no_response' });
  });

  it('las herramientas de recursos cuentan para su servidor', () => {
    const events = [row('tool.pre', 5, { tool_name: 'ReadMcpResourceTool', payload: { tool_input: { server: 'docs', uri: 'docs://guia' }, tool_use_id: 't1' } })];
    expect(only(mcpInvocationsOfSession(events, NOW))).toMatchObject({ server: 'docs', tool: 'ReadMcpResourceTool', scope: null });
  });

  it('ignora las herramientas que no son MCP y los Eventos mal formados', () => {
    const events = [
      row('tool.pre', 5, { tool_name: 'Bash', payload: { tool_input: { command: 'ls' } } }),
      row('tool.pre', 4, { tool_name: 'ReadMcpResourceTool', payload: { tool_input: 'roto' } }),
      row('tool.pre', 3, { tool_name: NAVIGATE }),
    ];
    const items = mcpInvocationsOfSession(events, NOW);
    expect(items.map((i) => i.server)).toStrictEqual(['playwright']);
  });

  it('devuelve la más reciente primero', () => {
    const events = [pre(9, NAVIGATE, 't1'), pre(8, SCREENSHOT, 't2')];
    expect(mcpInvocationsOfSession(events, NOW).map((i) => i.tool)).toStrictEqual(['browser_take_screenshot', 'browser_navigate']);
  });
});

describe('AC-41: herramientas diferidas sin usar', () => {
  it('son las MCP que ToolSearch cargó y nunca se invocaron', async () => {
    const { unusedDeferredOfSession } = await import('../src/domain/mcp-invocations.js');
    const events = [
      row('tool.post', 9, { tool_name: 'ToolSearch', payload: { tool_response: { matches: [NAVIGATE, SCREENSHOT, 'WebFetch'], query: 'select:…' } } }),
      pre(8, NAVIGATE, 't1'),
      row('tool.post', 7, { tool_name: 'ToolSearch', payload: { tool_response: { matches: [SCREENSHOT] } } }),
    ];
    expect(unusedDeferredOfSession(events)).toStrictEqual([
      { session_id: 's1', tool_name: SCREENSHOT, server: 'playwright', tool: 'browser_take_screenshot', loaded_at: at(9) },
    ]);
  });
});

describe('AC-42: uso por servidor y herramienta', () => {
  const inv = (tool: string, status: McpInvocation['status'], duration: number | null, bytes: number | null, session = 's1', minutesAgo = 5): McpInvocation =>
    ({
      server: 'playwright',
      scope: 'project',
      project: 'demo',
      session_id: session,
      tool,
      tool_name: `mcp__playwright__${tool}`,
      status,
      duration_ms: duration,
      response_bytes: bytes,
      has_image: tool === 'shot',
      started_at: at(minutesAgo),
    }) as McpInvocation;

  it('cuenta estados, % de fallos sin interrumpidas, percentiles, tamaños y Sesiones', () => {
    const [server] = mcpUsage([
      inv('nav', 'ok', 100, 1000, 's1', 9),
      inv('nav', 'ok', 300, 3000, 's2', 8),
      inv('nav', 'error', 200, null, 's1', 7),
      inv('nav', 'interrupted', null, null, 's1', 6),
      inv('shot', 'ok', 1000, 120_000, 's1', 1),
      inv('shot', 'no_response', null, null, 's1', 2),
    ]);

    expect(server).toMatchObject({
      server: 'playwright',
      scopes: ['project'],
      projects: ['demo'],
      calls: 6,
      ok: 3,
      errors: 1,
      interrupted: 1,
      no_response: 1,
      failure_rate: 0.25,
      latency_p50_ms: 200,
      latency_p95_ms: 1000,
      response_avg_bytes: 41_333,
      response_max_bytes: 120_000,
      has_image: true,
      last_at: at(1),
      sessions: 2,
    });
    expect(server!.tools.map((t) => [t.tool, t.calls, t.failure_rate])).toStrictEqual([
      ['nav', 4, 1 / 3],
      ['shot', 2, 0],
    ]);
  });

  it('sin ninguna terminada no hay % de fallos ni latencia', () => {
    const [server] = mcpUsage([inv('nav', 'running', null, null)]);
    expect(server).toMatchObject({ failure_rate: null, latency_p50_ms: null, response_avg_bytes: null });
  });
});

describe('AC-101: has_image reconoce los dos formatos de tool_response', () => {
  const block = { type: 'image', source: { data: 'x' } };
  it.each([
    ['array de primer nivel', [block], true],
    ['objeto con content', { content: [{ type: 'text', text: 'a' }, block] }, true],
    ['objeto con content sin imagen', { content: [{ type: 'text', text: 'a' }] }, false],
    ['content que no es array', { content: 'texto' }, false],
    ['texto plano', 'hola', false],
  ])('%s', (_name, response, expected) => {
    expect(digestOf({ tool_use_id: 't', tool_response: response }).has_image).toBe(expected);
  });
});
