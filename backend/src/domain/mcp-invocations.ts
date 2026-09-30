// Invocaciones de Herramientas MCP derivadas de los Eventos al consultar (AC-41),
// con el mismo patrón que las Ejecuciones de tests (ADR-0007): sin Tipo de
// evento nuevo ni cambios en el Adaptador.
import { summarizeSession, type SessionEventRow } from './session-summary.js';
import { summarizeToolInput } from './tool-summary.js';

export type McpInvocationStatus = 'ok' | 'error' | 'interrupted' | 'blocked' | 'running' | 'no_response';

export interface McpInvocation {
  id: string;
  event_id: string;
  project: string;
  directory: string;
  session_id: string;
  subagent_id: string | null;
  server: string;
  scope: string | null;
  tool: string;
  tool_name: string;
  summary: string | null;
  status: McpInvocationStatus;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  response_bytes: number | null;
  has_image: boolean;
  error: string | null;
}

/**
 * Lo que hace falta de un `tool.post`, sin su respuesta: una captura en base64
 * pesa ~120 KB y el repositorio la resume en SQL en lugar de cargarla.
 */
export interface McpPostDigest {
  tool_use_id: string | null;
  duration_ms: number | null;
  is_interrupt: boolean;
  error: string | null;
  response_bytes: number | null;
  has_image: boolean;
}

/** Fila de la Sesión; los `tool.pre` y `ToolSearch` traen `payload`, los `tool.post` MCP su `digest`. */
export type McpEventRow = SessionEventRow & { payload?: Record<string, unknown>; digest?: McpPostDigest };

export interface UnusedDeferred {
  session_id: string;
  tool_name: string;
  server: string;
  tool: string;
  loaded_at: string;
}

export const MCP_PREFIX = 'mcp__';
export const RESOURCE_TOOLS: ReadonlySet<string> = new Set(['ListMcpResourcesTool', 'ReadMcpResourceTool']);
export const TOOL_SEARCH = 'ToolSearch';

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const firstLine = (value: unknown) => text(value)?.split('\n')[0]!.trim() ?? null;

/** `mcp__<servidor>__<herramienta>`; el servidor puede llevar `_` (`claude_ai_Claude_Docs`). */
export function serverOf(toolName: string): { server: string; tool: string } | null {
  if (!toolName.startsWith(MCP_PREFIX)) return null;
  const rest = toolName.slice(MCP_PREFIX.length);
  const cut = rest.lastIndexOf('__');
  if (cut <= 0 || cut + 2 >= rest.length) return null;
  return { server: rest.slice(0, cut), tool: rest.slice(cut + 2) };
}

/** La respuesta trae bloques `image` en el primer nivel o dentro de `{content:[…]}` (los dos formatos que emite Claude Code). */
function hasImage(response: unknown): boolean {
  const blocks = Array.isArray(response) ? response : record(response)?.content;
  return Array.isArray(blocks) && blocks.some((block) => record(block)?.type === 'image');
}

/** Lo mismo que el repositorio calcula en SQL, a partir del payload completo de un `tool.post`. */
export function digestOf(payload: Record<string, unknown>): McpPostDigest {
  const response = payload.tool_response;
  const serialized = response === undefined || response === null ? null : typeof response === 'string' ? response : JSON.stringify(response);
  return {
    tool_use_id: text(payload.tool_use_id),
    duration_ms: typeof payload.duration_ms === 'number' && payload.duration_ms >= 0 ? Math.round(payload.duration_ms) : null,
    is_interrupt: payload.is_interrupt === true,
    error: firstLine(payload.error),
    response_bytes: serialized === null ? null : Buffer.byteLength(serialized),
    has_image: hasImage(response),
  };
}

interface Started {
  row: McpEventRow;
  server: string;
  scope: string | null;
  tool: string;
  turn: number | null;
}

function started(row: McpEventRow, turn: number | null): Started | undefined {
  if ((row.event_type !== 'tool.pre' && row.event_type !== 'tool.blocked') || row.tool_name === null) return undefined;
  const mcp = record(row.payload?.mcp_server);
  const scope = text(mcp?.source);
  if (RESOURCE_TOOLS.has(row.tool_name)) {
    const server = text(record(row.payload?.tool_input)?.server) ?? text(mcp?.name);
    return server ? { row, server, scope, tool: row.tool_name, turn } : undefined;
  }
  const parsed = serverOf(row.tool_name);
  if (!parsed) return undefined;
  return { row, server: text(mcp?.name) ?? parsed.server, scope, tool: parsed.tool, turn };
}

/** Invocaciones de Herramientas MCP de una Sesión; `rows` en orden de llegada. La más reciente primero. */
export function mcpInvocationsOfSession(rows: McpEventRow[], now: Date): McpInvocation[] {
  const core = summarizeSession(rows, now);
  const dead = core.state === 'closed' || core.state === 'orphaned';
  const posts = new Map<string, McpEventRow>();
  const stops = new Set<string>();
  const found: Started[] = [];
  let turn = 0;

  for (const row of rows) {
    if (row.event_type === 'prompt.submitted' && row.subagent_id === null) turn += 1;
    if (row.event_type === 'subagent.stopped' && row.subagent_id !== null) stops.add(row.subagent_id);
    if (row.event_type === 'tool.post' && row.digest?.tool_use_id) posts.set(row.digest.tool_use_id, row);
    const invocation = started(row, turn === 0 ? null : turn);
    if (invocation) found.push(invocation);
  }

  return found
    .map(({ row, server, scope, tool, turn: turnIndex }): McpInvocation => {
      const toolUseId = text(row.payload?.tool_use_id);
      const post = toolUseId ? posts.get(toolUseId) : undefined;
      const digest = post?.digest;
      // Sin respuesta cuando ya no puede llegar: su Turno o su Subagente terminó, o la Sesión murió.
      const over =
        dead ||
        (row.subagent_id !== null ? stops.has(row.subagent_id) : turnIndex !== null && core.turns[turnIndex - 1]?.ended_at !== null);
      let status: McpInvocationStatus;
      if (row.event_type === 'tool.blocked') status = 'blocked';
      else if (digest?.is_interrupt) status = 'interrupted';
      else if (digest?.error) status = 'error';
      else if (post) status = 'ok';
      else status = over ? 'no_response' : 'running';
      const elapsed = post ? Math.max(0, Date.parse(post.occurred_at) - Date.parse(row.occurred_at)) : null;
      return {
        id: row.id,
        event_id: row.id,
        project: row.project,
        directory: row.directory,
        session_id: row.session_id,
        subagent_id: row.subagent_id,
        server,
        scope,
        tool,
        tool_name: row.tool_name!,
        summary: summarizeToolInput(row.tool_name, row.payload ?? {}),
        status,
        started_at: row.occurred_at,
        ended_at: post?.occurred_at ?? null,
        duration_ms: digest?.duration_ms ?? elapsed,
        response_bytes: digest?.response_bytes ?? null,
        has_image: digest?.has_image ?? false,
        error: digest?.error ?? null,
      };
    })
    .reverse();
}

/** Herramientas MCP que `ToolSearch` cargó en la Sesión y nunca se invocaron: contexto gastado sin uso. */
export function unusedDeferredOfSession(rows: McpEventRow[]): UnusedDeferred[] {
  const used = new Set(rows.filter((r) => r.event_type === 'tool.pre' || r.event_type === 'tool.blocked').map((r) => r.tool_name));
  const loaded = new Map<string, UnusedDeferred>();
  for (const row of rows) {
    if (row.event_type !== 'tool.post' || row.tool_name !== TOOL_SEARCH) continue;
    const matches = record(row.payload?.tool_response)?.matches;
    if (!Array.isArray(matches)) continue;
    for (const name of matches) {
      const parsed = typeof name === 'string' ? serverOf(name) : null;
      if (!parsed || used.has(name as string) || loaded.has(name as string)) continue;
      loaded.set(name as string, { session_id: row.session_id, tool_name: name as string, ...parsed, loaded_at: row.occurred_at });
    }
  }
  return [...loaded.values()];
}

export interface McpUsageStats {
  calls: number;
  ok: number;
  errors: number;
  interrupted: number;
  blocked: number;
  running: number;
  no_response: number;
  failure_rate: number | null;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  response_avg_bytes: number | null;
  response_max_bytes: number | null;
  has_image: boolean;
  last_at: string;
  sessions: number;
}

export interface McpToolUsage extends McpUsageStats {
  tool: string;
  tool_name: string;
}

export interface McpServerUsage extends McpUsageStats {
  server: string;
  scopes: string[];
  projects: string[];
  tools: McpToolUsage[];
}

/** Percentil por rango más cercano: siempre una latencia observada, no una interpolada. */
function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
}

function usageOf(items: McpInvocation[]): McpUsageStats {
  const count = (status: McpInvocationStatus) => items.filter((i) => i.status === status).length;
  const ok = count('ok');
  const errors = count('error');
  const latencies = items.map((i) => i.duration_ms).filter((d): d is number => d !== null).sort((a, b) => a - b);
  const sizes = items.map((i) => i.response_bytes).filter((b): b is number => b !== null);
  return {
    calls: items.length,
    ok,
    errors,
    interrupted: count('interrupted'),
    blocked: count('blocked'),
    running: count('running'),
    no_response: count('no_response'),
    // Ni las interrumpidas ni las bloqueadas dicen nada de la salud del servidor.
    failure_rate: ok + errors === 0 ? null : errors / (ok + errors),
    latency_p50_ms: percentile(latencies, 0.5),
    latency_p95_ms: percentile(latencies, 0.95),
    response_avg_bytes: sizes.length === 0 ? null : Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
    response_max_bytes: sizes.length === 0 ? null : Math.max(...sizes),
    has_image: items.some((i) => i.has_image),
    last_at: items.reduce((last, i) => (i.started_at > last ? i.started_at : last), items[0]!.started_at),
    sessions: new Set(items.map((i) => i.session_id)).size,
  };
}

function groupBy<K>(items: McpInvocation[], keyOf: (i: McpInvocation) => K): Map<K, McpInvocation[]> {
  const groups = new Map<K, McpInvocation[]>();
  for (const item of items) {
    const group = groups.get(keyOf(item));
    if (group) group.push(item);
    else groups.set(keyOf(item), [item]);
  }
  return groups;
}

const byCalls = (a: { calls: number; last_at: string }, b: { calls: number; last_at: string }) =>
  b.calls - a.calls || b.last_at.localeCompare(a.last_at);

/** Una fila por Servidor MCP, con sus herramientas, ordenadas por llamadas (AC-42). */
export function mcpUsage(items: McpInvocation[]): McpServerUsage[] {
  return [...groupBy(items, (i) => i.server)]
    .map(([server, group]) => ({
      server,
      scopes: [...new Set(group.map((i) => i.scope).filter((s): s is string => s !== null))].sort(),
      projects: [...new Set(group.map((i) => i.project))].sort(),
      ...usageOf(group),
      tools: [...groupBy(group, (i) => i.tool_name)]
        .map(([toolName, calls]) => ({ tool: calls[0]!.tool, tool_name: toolName, ...usageOf(calls) }))
        .sort(byCalls),
    }))
    .sort(byCalls);
}
