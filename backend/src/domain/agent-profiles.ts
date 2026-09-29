// Perfil de cada Tipo de Subagente (AC-45, AC-46): lo que hacen sus
// Lanzamientos y cómo se comparan con los demás Tipos. Agrega registros que el
// caso de uso arma con el ciclo de vida del 1.7 (AC-33).
import { serverOf } from './mcp-invocations.js';
import type { Score } from './evaluation.js';
import type { SessionEventRow } from './session-summary.js';

export type LaunchStatus = 'running' | 'finished' | 'no_response';

export interface TokenTotals {
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
}

export interface ToolTally {
  name: string;
  calls: number;
  errors: number;
  blocks: number;
}

export interface McpTally {
  server: string;
  calls: number;
  errors: number;
}

/** `AgentLaunch` de `spec/api-spec.yaml`. */
export interface AgentLaunch {
  session_id: string;
  project: string;
  subagent_id: string | null;
  tool_use_id: string | null;
  description: string | null;
  status: LaunchStatus;
  background: boolean;
  started_at: string;
  stopped_at: string | null;
  duration_ms: number;
  tool_count: number;
  tool_errors: number;
  blocks: number;
  model: string | null;
  tokens: TokenTotals | null;
  estimated_cost_usd: number | null;
  /** Eficiencia de la caché de su Subagente; `null` sin Transcript (AC-73). */
  cache_hit_rate: number | null;
  cache_savings_net_usd: number | null;
  result: string | null;
}

/** Un Lanzamiento con su Tipo, su lanzador y lo que hizo su Subagente. */
export interface LaunchRecord extends AgentLaunch {
  type: string | null;
  /** `null`: el agente principal. */
  launcher: string | null;
  tools: ToolTally[];
  /** Una entrada por Invocación de skill. */
  skills: string[];
  mcp: McpTally[];
  tests: { passed: number; failed: number };
  /** Puntuación de la Evaluación de su Subagente (AC-59). */
  rating?: Score | null;
}

export interface AgentTypeSummary {
  type: string | null;
  launches: number;
  running: number;
  no_response: number;
  foreground: number;
  background: number;
  duration_p50_ms: number | null;
  duration_p95_ms: number | null;
  tokens: TokenTotals;
  estimated_cost_usd: number;
  cost_per_launch_usd: number | null;
  tool_errors_per_launch: number;
  blocks_per_launch: number;
  /** Con los tokens de todos sus Lanzamientos, no la media de sus tasas (AC-73). */
  cache_hit_rate: number | null;
  cache_savings_net_usd: number;
  /** Lanzamientos cuyo Subagente tiene una Evaluación con +1 / −1 (AC-59). */
  rated_up: number;
  rated_down: number;
  sessions: number;
  projects: string[];
  last_at: string;
}

export interface AgentProfile {
  summary: AgentTypeSummary;
  launched_by: Array<{ launcher: string | null; launches: number }>;
  models: Array<{ model: string; launches: number }>;
  tools: ToolTally[];
  skills: Array<{ skill: string; invocations: number }>;
  mcp_servers: McpTally[];
  test_runs: { total: number; passed: number; failed: number };
  launches: AgentLaunch[];
}

export const LAUNCHES_LIMIT = 500;

/** Lo que hizo un Subagente según sus propios Eventos; `rows` son solo los suyos. */
export function ownActivity(rows: SessionEventRow[]): Pick<LaunchRecord, 'tool_count' | 'tool_errors' | 'blocks' | 'tools' | 'skills' | 'mcp'> {
  const tools = new Map<string, ToolTally>();
  const mcp = new Map<string, McpTally>();
  const skills: string[] = [];
  const tally = (name: string) => tools.get(name) ?? tools.set(name, { name, calls: 0, errors: 0, blocks: 0 }).get(name)!;
  const server = (name: string) => {
    const parsed = serverOf(name);
    return parsed ? (mcp.get(parsed.server) ?? mcp.set(parsed.server, { server: parsed.server, calls: 0, errors: 0 }).get(parsed.server)!) : undefined;
  };
  for (const r of rows) {
    if (r.tool_name === null) continue;
    if (r.event_type === 'tool.pre') {
      tally(r.tool_name).calls += 1;
      const s = server(r.tool_name);
      if (s) s.calls += 1;
      if (r.skill_name) skills.push(r.skill_name);
    } else if (r.event_type === 'tool.post' && r.tool_error) {
      tally(r.tool_name).errors += 1;
      const s = server(r.tool_name);
      if (s) s.errors += 1;
    } else if (r.event_type === 'tool.blocked') {
      tally(r.tool_name).blocks += 1;
    }
  }
  const list = [...tools.values()];
  return {
    tool_count: list.reduce((n, t) => n + t.calls, 0),
    tool_errors: list.reduce((n, t) => n + t.errors, 0),
    blocks: list.reduce((n, t) => n + t.blocks, 0),
    tools: list,
    skills,
    mcp: [...mcp.values()],
  };
}

/** Percentil por rango más cercano: siempre una duración observada. */
function percentile(sorted: number[], p: number): number | null {
  return sorted.length === 0 ? null : sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
}

// Evita arrastrar decimales de coma flotante hasta la UI.
const round = (usd: number) => Math.round(usd * 1e6) / 1e6;

/** `cache_read / (input + cache_read + cache_creation)`; `null` sin tokens de entrada. */
const hitRate = (t: TokenTotals) => (t.input + t.cache_read + t.cache_creation === 0 ? null : t.cache_read / (t.input + t.cache_read + t.cache_creation));

function summaryOf(type: string | null, launches: LaunchRecord[]): AgentTypeSummary {
  const count = (pick: (l: LaunchRecord) => boolean) => launches.filter(pick).length;
  const durations = launches
    .filter((l) => l.status === 'finished')
    .map((l) => l.duration_ms)
    .sort((a, b) => a - b);
  const costs = launches.map((l) => l.estimated_cost_usd).filter((c): c is number => c !== null);
  const tokens: TokenTotals = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
  for (const l of launches) {
    if (!l.tokens) continue;
    tokens.input += l.tokens.input;
    tokens.output += l.tokens.output;
    tokens.cache_read += l.tokens.cache_read;
    tokens.cache_creation += l.tokens.cache_creation;
  }
  const total = launches.length;
  return {
    type,
    launches: total,
    running: count((l) => l.status === 'running'),
    no_response: count((l) => l.status === 'no_response'),
    foreground: count((l) => !l.background),
    background: count((l) => l.background),
    duration_p50_ms: percentile(durations, 0.5),
    duration_p95_ms: percentile(durations, 0.95),
    tokens,
    estimated_cost_usd: round(costs.reduce((a, b) => a + b, 0)),
    cost_per_launch_usd: costs.length === 0 ? null : round(costs.reduce((a, b) => a + b, 0) / costs.length),
    tool_errors_per_launch: total === 0 ? 0 : launches.reduce((n, l) => n + l.tool_errors, 0) / total,
    blocks_per_launch: total === 0 ? 0 : launches.reduce((n, l) => n + l.blocks, 0) / total,
    cache_hit_rate: hitRate(tokens),
    cache_savings_net_usd: round(launches.reduce((sum, l) => sum + (l.cache_savings_net_usd ?? 0), 0)),
    rated_up: count((l) => l.rating === 1),
    rated_down: count((l) => l.rating === -1),
    sessions: new Set(launches.map((l) => l.session_id)).size,
    projects: [...new Set(launches.map((l) => l.project))].sort(),
    last_at: launches.reduce((last, l) => (l.started_at > last ? l.started_at : last), launches[0]?.started_at ?? ''),
  };
}

function groupBy<K, T>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const group = groups.get(keyOf(item));
    if (group) group.push(item);
    else groups.set(keyOf(item), [item]);
  }
  return groups;
}

/** Una fila por Tipo de Subagente, ordenadas por Lanzamientos (AC-46). */
export function agentSummaries(launches: LaunchRecord[]): AgentTypeSummary[] {
  return [...groupBy(launches, (l) => l.type)]
    .map(([type, group]) => summaryOf(type, group))
    .sort((a, b) => b.launches - a.launches || b.last_at.localeCompare(a.last_at));
}

const byCount = <T>(entries: Map<string, T>, value: (t: T) => number) =>
  [...entries.values()].sort((a, b) => value(b) - value(a));

/** Perfil de un Tipo a partir de sus Lanzamientos; `type` nombra el perfil si no hay ninguno. */
export function agentProfile(launches: LaunchRecord[], type: string | null = launches[0]?.type ?? null): AgentProfile {
  const launchers = new Map<string | null, number>();
  const models = new Map<string, number>();
  const tools = new Map<string, ToolTally>();
  const skills = new Map<string, number>();
  const mcp = new Map<string, McpTally>();
  const tests = { total: 0, passed: 0, failed: 0 };
  for (const l of launches) {
    launchers.set(l.launcher, (launchers.get(l.launcher) ?? 0) + 1);
    if (l.model) models.set(l.model, (models.get(l.model) ?? 0) + 1);
    for (const t of l.tools) {
      const acc = tools.get(t.name) ?? { name: t.name, calls: 0, errors: 0, blocks: 0 };
      acc.calls += t.calls;
      acc.errors += t.errors;
      acc.blocks += t.blocks;
      tools.set(t.name, acc);
    }
    for (const s of l.skills) skills.set(s, (skills.get(s) ?? 0) + 1);
    for (const m of l.mcp) {
      const acc = mcp.get(m.server) ?? { server: m.server, calls: 0, errors: 0 };
      acc.calls += m.calls;
      acc.errors += m.errors;
      mcp.set(m.server, acc);
    }
    tests.passed += l.tests.passed;
    tests.failed += l.tests.failed;
  }
  tests.total = tests.passed + tests.failed;
  return {
    summary: summaryOf(type, launches),
    launched_by: [...launchers].map(([launcher, n]) => ({ launcher, launches: n })).sort((a, b) => b.launches - a.launches),
    models: [...models].map(([model, n]) => ({ model, launches: n })).sort((a, b) => b.launches - a.launches || a.model.localeCompare(b.model)),
    tools: byCount(tools, (t) => t.calls),
    skills: [...skills].map(([skill, n]) => ({ skill, invocations: n })).sort((a, b) => b.invocations - a.invocations),
    mcp_servers: byCount(mcp, (m) => m.calls),
    test_runs: tests,
    launches: [...launches]
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, LAUNCHES_LIMIT)
      .map(({ type: _t, launcher: _l, tools: _tools, skills: _s, mcp: _m, tests: _tests, ...rest }) => rest),
  };
}
