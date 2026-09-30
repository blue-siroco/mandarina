import type { Page, Route, WebSocketRoute } from '@playwright/test';

// Datos y red simulada compartidos por los E2E: nunca backend real ni Prism (CLAUDE.md).

export const SESSION_ID = '7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export function eventDto(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    schema_version: 1,
    harness: 'claude-code',
    project: 'demo',
    directory: 'C:\\Codev\\demo',
    session_id: SESSION_ID,
    subagent_id: null,
    event_type: 'tool.pre',
    native_event_type: 'PreToolUse',
    tool_name: 'Bash',
    occurred_at: minutesAgo(2),
    received_at: minutesAgo(2),
    transcript_path: null,
    payload: { tool_input: { command: 'npm test' } },
    block: null,
    subagent: null,
    warnings: [],
    ...overrides,
  };
}

export function blockDto(id: string, rule: string, overrides: Record<string, unknown> = {}) {
  return eventDto(id, {
    event_type: 'tool.blocked',
    payload: { tool_input: { command: 'rm -rf /' } },
    block: { rule, reason: 'Borrado recursivo fuera del Directorio' },
    ...overrides,
  });
}

export function sessionDto(id: string, overrides: Record<string, unknown> = {}) {
  return {
    session_id: id,
    project: 'demo',
    directory: 'C:\\Codev\\demo',
    harness: 'claude-code',
    state: 'active',
    activity: 'working',
    current_tool: { name: 'Bash', summary: 'npm test' },
    model: 'claude-opus-5-5',
    started_at: minutesAgo(70),
    last_event_at: minutesAgo(0),
    last_activity_at: minutesAgo(0),
    event_count: 120,
    tool_count: 40,
    prompt_count: 5,
    turn_count: 5,
    subagent_count: 2,
    running_subagents: 1,
    live_subagents: [
      {
        subagent_id: 'agent-9a8b7c',
        agent_type: 'Explore',
        description: 'Buscar plugins de observabilidad',
        current_tool: { name: 'Grep', summary: 'observe' },
      },
    ],
    block_count: 1,
    evaluation_score: null,
    injection_alerts: 0,
    budget_stopped: false,
    active_duration_ms: 42 * 60_000,
    clock_duration_ms: 70 * 60_000,
    sparkline: [1, 2, 5, 7, 3, 1, 2, 6, 8, 5, 2, 4],
    ...overrides,
  };
}

export function detailDto(id: string, overrides: Record<string, unknown> = {}) {
  return {
    ...sessionDto(id),
    transcript_available: true,
    cache: null,
    cache_rewrites: [],
    usage: {
      tokens: { input: 1200, output: 45_000, cache_read: 4_700_000, cache_creation: 240_000 },
      estimated_cost_usd: 3.4212,
      requests: 48,
      models: ['claude-opus-5-5'],
    },
    context: { model: 'claude-opus-5-5', used: 91_900, limit: 1_000_000 },
    tools: [
      { name: 'Bash', count: 20 },
      { name: 'Read', count: 12 },
    ],
    turns: [
      { id: 'prompt-1', index: 1, started_at: minutesAgo(60), ended_at: minutesAgo(50), duration_ms: 600_000, prompt: 'Añade un test para el login', tool_count: 8 },
      { id: 'prompt-2', index: 2, started_at: minutesAgo(10), ended_at: null, duration_ms: 120_000, prompt: 'Arregla el build', tool_count: 3 },
    ],
    subagents: [
      {
        subagent_id: 'agent-9a8b7c',
        tool_use_id: 'toolu_01',
        status: 'finished',
        internal: false,
        agent_type: 'Explore',
        started_at: minutesAgo(55),
        stopped_at: minutesAgo(52),
        duration_ms: 180_000,
        tool_count: 6,
        model: 'claude-haiku-4-5',
        tokens: { input: 500, output: 900, cache_read: 0, cache_creation: 0 },
        task: {
          description: 'Buscar plugins de observabilidad',
          prompt: 'Busca en el repositorio los plugins de observabilidad y resume cómo se registran.',
        },
        tools: [
          { name: 'Grep', summary: 'observe', started_at: minutesAgo(54), status: 'ok' },
          { name: 'Read', summary: 'src/plugins.ts', started_at: minutesAgo(53), status: 'error' },
        ],
        result: 'Hay 3 plugins; se registran en src/plugins.ts.',
      },
    ],
    blocks: [
      {
        event_id: 'blk-1',
        occurred_at: minutesAgo(30),
        subagent_id: null,
        tool_name: 'Bash',
        summary: 'rm -rf /',
        rule: 'dangerous-rm',
        reason: 'Borrado recursivo fuera del Directorio',
      },
    ],
    ...overrides,
  };
}

/** Eficiencia de la caché (AC-71): con ahorro por defecto; los E2E la sobrescriben con `cacheDto({...})`. */
export function cacheDto(overrides: Record<string, unknown> = {}) {
  return {
    hit_rate: 0.9,
    read_tokens: 900_000,
    write_5m_tokens: 80_000,
    write_1h_tokens: 20_000,
    savings_gross_usd: 1.62,
    write_overhead_usd: 0.42,
    savings_net_usd: 1.2,
    rewrites: 2,
    rewrite_cost_usd: 0.3,
    unpriced_models: [] as string[],
    ...overrides,
  };
}

export const EMPTY_CACHE = cacheDto({
  hit_rate: null,
  read_tokens: 0,
  write_5m_tokens: 0,
  write_1h_tokens: 0,
  savings_gross_usd: 0,
  write_overhead_usd: 0,
  savings_net_usd: 0,
  rewrites: 0,
  rewrite_cost_usd: 0,
});

export const EMPTY_METRICS = {
  since: minutesAgo(600),
  generated_at: minutesAgo(0),
  sessions: { total: 0, working: 0, paused: 0, orphaned: 0, closed: 0 },
  subagents_running: 0,
  tokens: { input: 0, output: 0, cache_read: 0, cache_creation: 0 },
  estimated_cost_usd: 0,
  unpriced_models: [],
  cache: EMPTY_CACHE,
  by_model: [],
  transcripts: { read: 0, unavailable: 0 },
  breakdown: null,
};

export function testRunDto(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `${id}:vitest`,
    event_id: id,
    project: 'demo',
    directory: 'C:/Codev/demo',
    session_id: SESSION_ID,
    subagent_id: null,
    kind: 'unit',
    runner: 'vitest',
    command: 'npx vitest run',
    status: 'passed',
    counts: { total: 12, passed: 12, failed: 0, skipped: 0 },
    duration_ms: 1230,
    finished_at: minutesAgo(3),
    failures: [],
    ...overrides,
  };
}

export function skillInvocationDto(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    event_id: id,
    project: 'demo',
    directory: 'C:/Codev/demo',
    session_id: SESSION_ID,
    subagent_id: null,
    subagent_type: null,
    turn: 1,
    skill: 'tdd',
    args: 'añade un test para el login',
    invoker: 'agent',
    status: 'finished',
    started_at: minutesAgo(58),
    ended_at: minutesAgo(50),
    duration_ms: 480_000,
    error: null,
    ...overrides,
  };
}

export function subagentItemDto(key: string, overrides: Record<string, unknown> = {}) {
  return {
    session_id: SESSION_ID,
    project: 'demo',
    directory: 'C:/Codev/demo',
    subagent_id: key,
    tool_use_id: `toolu_${key}`,
    agent_type: 'Explore',
    description: 'Buscar plugins de observabilidad',
    internal: false,
    status: 'finished',
    started_at: minutesAgo(55),
    stopped_at: minutesAgo(52),
    duration_ms: 180_000,
    tool_count: 6,
    model: 'claude-haiku-4-5',
    tokens: { input: 500, output: 900, cache_read: 0, cache_creation: 0 },
    estimated_cost_usd: 0.0041,
    ...overrides,
  };
}

export function mcpInvocationDto(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    event_id: id,
    project: 'demo',
    directory: 'C:/Codev/demo',
    session_id: SESSION_ID,
    subagent_id: null,
    server: 'playwright',
    scope: 'project',
    tool: 'browser_navigate',
    tool_name: 'mcp__playwright__browser_navigate',
    summary: 'http://localhost:4200',
    status: 'ok',
    started_at: minutesAgo(20),
    ended_at: minutesAgo(20),
    duration_ms: 850,
    response_bytes: 2048,
    has_image: false,
    error: null,
    ...overrides,
  };
}

const mcpStats = (calls: number, failureRate: number | null, hasImage: boolean) => ({
  calls,
  ok: calls,
  errors: 0,
  interrupted: 0,
  blocked: 0,
  running: 0,
  no_response: 0,
  failure_rate: failureRate,
  latency_p50_ms: 850,
  latency_p95_ms: 2500,
  response_avg_bytes: 2048,
  response_max_bytes: hasImage ? 120_000 : 4096,
  has_image: hasImage,
  last_at: minutesAgo(20),
  sessions: 1,
});

export function mcpServerDto(server: string, overrides: Record<string, unknown> = {}) {
  return {
    ...mcpStats(3, 0.25, true),
    server,
    scopes: ['project'],
    projects: ['demo'],
    tools: [
      { ...mcpStats(2, 0, false), tool: 'browser_navigate', tool_name: `mcp__${server}__browser_navigate` },
      { ...mcpStats(1, 0.5, true), tool: 'browser_take_screenshot', tool_name: `mcp__${server}__browser_take_screenshot` },
    ],
    ...overrides,
  };
}

export interface McpInvocationListDto {
  items: unknown[];
  servers: unknown[];
  unused_deferred: unknown[];
  facets: { projects: string[]; servers: string[] };
}

export const EMPTY_MCP: McpInvocationListDto = { items: [], servers: [], unused_deferred: [], facets: { projects: [], servers: [] } };

export interface SubagentListDto {
  items: unknown[];
  facets: { projects: string[]; types: string[] };
}

export const EMPTY_SUBAGENTS: SubagentListDto = { items: [], facets: { projects: [], types: [] } };

export interface SkillInvocationListDto {
  items: unknown[];
  stats: unknown[];
  facets: { projects: string[] };
}

export const EMPTY_SKILL_INVOCATIONS: SkillInvocationListDto = { items: [], stats: [], facets: { projects: [] } };

export const EXPORTER_DISABLED = {
  enabled: false,
  endpoint_host: null,
  include_content: false,
  enabled_since: null,
  counts: { pending: 0, exported: 0, failed: 0 },
  last_exported_at: null,
  recent: [],
};

export const EVALUATIONS_EMPTY = { items: [], tags: [], facets: { projects: [] } };

/** Respuestas de la API de Evaluaciones (AC-55); por defecto, vacía y eco de lo que se guarda. */
export const WARNINGS_EMPTY = { items: [], facets: { projects: [], patterns: [] } };
export const MASKING_EMPTY = {
  since: '1970-01-01T00:00:00.000Z',
  totals: { API_KEY: 0, TOKEN: 0, PRIVATE_KEY: 0, PASSWORD: 0, EMAIL: 0, PHONE: 0, IBAN: 0, CARD: 0, ID: 0 },
  items: [],
};

/** Respuestas de la API de Seguridad (AC-64, AC-65); por defecto, sin avisos ni marcadores. */
export interface SecurityMocks {
  warnings?: (url: URL) => unknown;
  masking?: (url: URL) => unknown;
  /** Estado de `PUT`/`DELETE` del descarte; por defecto 204. */
  dismissalStatus?: () => number;
}

export interface SecurityCall {
  method: string;
  url: URL;
}

export interface EvaluationMocks {
  list?: (url: URL) => unknown;
  tags?: () => unknown;
  /** Respuesta del `PUT`; sin ella se devuelve la Evaluación que se envió. */
  put?: (objectType: string, objectId: string, body: Record<string, unknown>) => unknown;
  /** Estado con el que falla el `PUT` (AC-57: "No se pudo guardar"); 200 = no falla. */
  putStatus?: () => number;
}

export interface EvaluationCall {
  method: string;
  url: URL;
  body: Record<string, unknown> | null;
}

/** Presupuestos (AC-81 a AC-84). */
export function budgetDto(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    scope: 'global_day',
    project: null,
    limit_usd: 50,
    warn_ratio: 0.8,
    action: 'stop',
    enabled: true,
    state: 'within',
    spent_usd: 12,
    subjects: [{ session_id: null, project: null, spent_usd: 12, ratio: 0.24, state: 'within', allowed: false }],
    sessions_tracked: 0,
    allowances: [],
    created_at: '2026-09-25T09:00:00.000Z',
    updated_at: '2026-09-25T09:00:00.000Z',
    ...overrides,
  };
}

export interface BudgetCall {
  method: string;
  url: URL;
  body: Record<string, unknown> | null;
}

export interface ApiMocks {
  /** Presupuestos de partida; el mock los crea, cambia y borra como haría la API. Por defecto, ninguno. */
  budgets?: Array<Record<string, unknown>>;
  events?: (url: URL) => unknown[];
  testRuns?: (url: URL) => { items: unknown[]; facets: { projects: string[] } };
  skillInvocations?: (url: URL) => SkillInvocationListDto;
  subagents?: (url: URL) => SubagentListDto;
  mcpInvocations?: (url: URL) => McpInvocationListDto;
  agents?: (url: URL) => { items: unknown[]; facets: { projects: string[] } };
  agentProfile?: (type: string, url: URL) => unknown;
  /** Estado de la Exportación OTLP (AC-52); por defecto, desactivada. */
  exporter?: () => unknown;
  evaluations?: EvaluationMocks;
  security?: SecurityMocks;
  sessions?: (url: URL) => { items: unknown[]; facets: { projects: string[]; directories: string[] } };
  detail?: (id: string) => unknown | null;
  /** Respuesta fija, o calculada a partir de la petición (AC-38: `directory`, `breakdown`). */
  metrics?: unknown | ((url: URL) => unknown);
  /** Uso de la suscripción (AC-136); por defecto `{ usage: null }`: cuenta sin suscripción, sin ficha. */
  subscriptionUsage?: unknown | (() => unknown);
}

export interface MockedApi {
  socket: () => Promise<WebSocketRoute>;
  /** Llamadas a `/api/v1/evaluations…`, en orden (AC-55, AC-57). */
  evaluationCalls: EvaluationCall[];
  /** Llamadas a `/api/v1/budgets…`, en orden (AC-82). */
  budgetCalls: BudgetCall[];
  /** Llamadas a `/api/v1/injection-warnings…` y `/api/v1/masking-stats`, en orden (AC-64 a AC-67). */
  securityCalls: SecurityCall[];
  /** URLs pedidas a cada ruta, en orden. */
  requests: { events: URL[]; sessions: URL[]; detail: URL[]; testRuns: URL[]; skillInvocations: URL[]; subagents: URL[]; metrics: URL[]; mcpInvocations: URL[]; agents: URL[]; exporter: URL[] };
}

/** Intercepta toda la API y el WebSocket. Hay que llamarla antes del `goto`. */
export async function mockApi(page: Page, mocks: ApiMocks = {}): Promise<MockedApi> {
  let resolveSocket: (ws: WebSocketRoute) => void = () => undefined;
  const socket = new Promise<WebSocketRoute>((resolve) => (resolveSocket = resolve));
  const requests: MockedApi['requests'] = { events: [], sessions: [], detail: [], testRuns: [], skillInvocations: [], subagents: [], metrics: [], mcpInvocations: [], agents: [], exporter: [] };
  const url = (route: Route) => new URL(route.request().url());

  await page.route(/\/api\/v1\/events(\?|$)/, (route) => {
    requests.events.push(url(route));
    return route.fulfill({ json: { items: mocks.events?.(url(route)) ?? [] } });
  });
  await page.route(/\/api\/v1\/sessions(\?|$)/, (route) => {
    requests.sessions.push(url(route));
    return route.fulfill({ json: mocks.sessions?.(url(route)) ?? { items: [], facets: { projects: [], directories: [] } } });
  });
  await page.route(/\/api\/v1\/sessions\/[^/?]+/, (route) => {
    requests.detail.push(url(route));
    const id = decodeURIComponent(url(route).pathname.split('/').pop() ?? '');
    const detail = mocks.detail?.(id) ?? null;
    return detail === null
      ? route.fulfill({ status: 404, json: { message: 'No existe' } })
      : route.fulfill({ json: detail });
  });
  await page.route(/\/api\/v1\/metrics(\?|$)/, (route) => {
    requests.metrics.push(url(route));
    const metrics = typeof mocks.metrics === 'function' ? mocks.metrics(url(route)) : mocks.metrics;
    return route.fulfill({ json: metrics ?? EMPTY_METRICS });
  });
  await page.route(/\/api\/v1\/test-runs(\?|$)/, (route) => {
    requests.testRuns.push(url(route));
    return route.fulfill({ json: mocks.testRuns?.(url(route)) ?? { items: [], facets: { projects: [] } } });
  });
  await page.route(/\/api\/v1\/skill-invocations(\?|$)/, (route) => {
    requests.skillInvocations.push(url(route));
    return route.fulfill({ json: mocks.skillInvocations?.(url(route)) ?? EMPTY_SKILL_INVOCATIONS });
  });
  await page.route(/\/api\/v1\/agents(\/[^?]+)?(\?|$)/, (route) => {
    const current = url(route);
    requests.agents.push(current);
    const type = current.pathname.split('/api/v1/agents/')[1];
    if (type === undefined) return route.fulfill({ json: mocks.agents?.(current) ?? { items: [], facets: { projects: [] } } });
    return route.fulfill({ json: mocks.agentProfile?.(decodeURIComponent(type), current) ?? { message: 'Sin perfil' }, status: mocks.agentProfile ? 200 : 404 });
  });
  await page.route('**/api/v1/subscription-usage', (route) => {
    const usage = typeof mocks.subscriptionUsage === 'function' ? mocks.subscriptionUsage() : mocks.subscriptionUsage;
    return route.fulfill({ json: usage ?? { usage: null } });
  });
  const securityCalls: SecurityCall[] = [];
  await page.route(/\/api\/v1\/injection-warnings(\/[^?]*)?(\?|$)/, (route) => {
    const current = url(route);
    const method = route.request().method();
    securityCalls.push({ method, url: current });
    if (method === 'GET') return route.fulfill({ json: mocks.security?.warnings?.(current) ?? WARNINGS_EMPTY });
    const status = mocks.security?.dismissalStatus?.() ?? 204;
    return status === 204 ? route.fulfill({ status }) : route.fulfill({ status, json: { message: 'error' } });
  });
  await page.route(/\/api\/v1\/masking-stats(\?|$)/, (route) => {
    const current = url(route);
    securityCalls.push({ method: route.request().method(), url: current });
    return route.fulfill({ json: mocks.security?.masking?.(current) ?? MASKING_EMPTY });
  });
  const evaluationCalls: EvaluationCall[] = [];
  await page.route(/\/api\/v1\/evaluations(\/[^?]*)?(\?|$)/, (route) => {
    const current = url(route);
    const method = route.request().method();
    const body = method === 'PUT' ? (route.request().postDataJSON() as Record<string, unknown>) : null;
    evaluationCalls.push({ method, url: current, body });
    const rest = current.pathname.slice('/api/v1/evaluations'.length).split('/').filter(Boolean).map(decodeURIComponent);
    const evaluations = mocks.evaluations ?? {};
    if (method === 'GET' && rest.length === 0) return route.fulfill({ json: evaluations.list?.(current) ?? EVALUATIONS_EMPTY });
    if (method === 'GET' && rest[0] === 'tags') return route.fulfill({ json: evaluations.tags?.() ?? { items: [] } });
    if (method === 'GET' && rest[0] === 'export') return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: '' });
    if (method === 'DELETE') return route.fulfill({ status: 204 });
    const [objectType = 'session', objectId = ''] = rest;
    const status = evaluations.putStatus?.() ?? 200;
    if (status !== 200) return route.fulfill({ status, json: { message: 'error' } });
    const now = new Date().toISOString();
    return route.fulfill({
      json: evaluations.put?.(objectType, objectId, body ?? {}) ?? {
        object_type: objectType,
        object_id: objectId,
        session_id: objectId,
        project: 'demo',
        summary: null,
        agent_type: null,
        created_at: now,
        updated_at: now,
        ...body,
      },
    });
  });
  await page.route(/\/api\/v1\/exporter(\?|$)/, (route) => {
    requests.exporter.push(url(route));
    return route.fulfill({ json: mocks.exporter?.() ?? EXPORTER_DISABLED });
  });
  await page.route(/\/api\/v1\/mcp-invocations(\?|$)/, (route) => {
    requests.mcpInvocations.push(url(route));
    return route.fulfill({ json: mocks.mcpInvocations?.(url(route)) ?? EMPTY_MCP });
  });
  await page.route(/\/api\/v1\/subagents(\?|$)/, (route) => {
    requests.subagents.push(url(route));
    return route.fulfill({ json: mocks.subagents?.(url(route)) ?? EMPTY_SUBAGENTS });
  });
  await page.routeWebSocket(/\/ws$/, (ws) => resolveSocket(ws));
  const budgetCalls: BudgetCall[] = [];
  let budgets = [...(mocks.budgets ?? [])];
  await page.route(/\/api\/v1\/budgets(\/[^?]*)?(\?|$)/, (route) => {
    const current = url(route);
    const method = route.request().method();
    const body = method === 'POST' || method === 'PUT' ? (route.request().postDataJSON() as Record<string, unknown>) : null;
    budgetCalls.push({ method, url: current, body });
    const [id, sub, allowanceId] = current.pathname.slice('/api/v1/budgets'.length).split('/').filter(Boolean).map(decodeURIComponent);
    const now = new Date().toISOString();
    if (id === undefined) {
      if (method === 'GET') return route.fulfill({ json: { items: budgets, generated_at: now } });
      const created = budgetDto({ id: 'nuevo-' + (budgets.length + 1), ...body, subjects: [], spent_usd: 0 });
      budgets = [...budgets, created];
      return route.fulfill({ status: 201, json: created });
    }
    if (sub === 'allowances') {
      if (method === 'POST') {
        const allowance = { id: 'al-' + Date.now(), budget_id: id, session_id: null, project: null, until: null, created_at: now, ...body };
        budgets = budgets.map((b) => (b['id'] === id ? { ...b, allowances: [...(b['allowances'] as unknown[]), allowance] } : b));
        return route.fulfill({ status: 201, json: allowance });
      }
      budgets = budgets.map((b) => (b['id'] === id ? { ...b, allowances: (b['allowances'] as Array<{ id: string }>).filter((a) => a.id !== allowanceId) } : b));
      return route.fulfill({ status: 204 });
    }
    if (method === 'DELETE') {
      budgets = budgets.filter((b) => b['id'] !== id);
      return route.fulfill({ status: 204 });
    }
    budgets = budgets.map((b) => (b['id'] === id ? { ...b, ...body } : b));
    return route.fulfill({ json: budgets.find((b) => b['id'] === id) });
  });
  return { socket: () => socket, requests, evaluationCalls, securityCalls, budgetCalls };
}

export const liveMessage = (event: unknown) => JSON.stringify({ type: 'event.ingested', event });
