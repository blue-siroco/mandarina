import type { EventType } from '../src/domain/event.js';
import type { SessionEventRow } from '../src/domain/session-summary.js';
import { agentProfile, agentSummaries, ownActivity, type LaunchRecord } from '../src/domain/agent-profiles.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

let seq = 0;
function row(eventType: EventType, overrides: Partial<SessionEventRow> = {}): SessionEventRow {
  seq += 1;
  return {
    id: `e${seq}`,
    session_id: 's1',
    project: 'demo',
    directory: '/code/demo',
    harness: 'claude-code',
    subagent_id: 'a1',
    event_type: eventType,
    tool_name: null,
    occurred_at: at(10),
    received_at: at(10),
    transcript_path: null,
    ...overrides,
  };
}

describe('AC-45: lo que hace un Subagente', () => {
  it('cuenta herramientas, errores, Bloqueos, skills y Servidores MCP de sus propios Eventos', () => {
    const activity = ownActivity([
      row('subagent.started'),
      row('tool.pre', { tool_name: 'Bash' }),
      row('tool.post', { tool_name: 'Bash', tool_error: true }),
      row('tool.pre', { tool_name: 'Bash' }),
      row('tool.post', { tool_name: 'Bash', tool_error: false }),
      row('tool.blocked', { tool_name: 'Bash' }),
      row('tool.pre', { tool_name: 'Skill', skill_name: 'tdd' }),
      row('tool.pre', { tool_name: 'mcp__playwright__browser_click' }),
      row('tool.post', { tool_name: 'mcp__playwright__browser_click', tool_error: true }),
      row('subagent.stopped'),
    ]);

    expect(activity).toStrictEqual({
      tool_count: 4,
      tool_errors: 2,
      blocks: 1,
      tools: [
        { name: 'Bash', calls: 2, errors: 1, blocks: 1 },
        { name: 'Skill', calls: 1, errors: 0, blocks: 0 },
        { name: 'mcp__playwright__browser_click', calls: 1, errors: 1, blocks: 0 },
      ],
      skills: ['tdd'],
      mcp: [{ server: 'playwright', calls: 1, errors: 1 }],
    });
  });
});

describe('AC-103: skills del Transcript en la actividad propia', () => {
  const use = (tool_use_id: string, skill: string) => ({ tool_use_id, skill, args: null, timestamp: at(9), error: null, failed: false });

  it('une las del hook y las del Transcript por tool_use_id, sin duplicar', () => {
    const activity = ownActivity(
      [row('tool.pre', { tool_name: 'Skill', skill_name: 'tdd', tool_use_id: 'k1' })],
      [use('k1', 'tdd'), use('k2', 'commit'), use('k2', 'commit')],
    );
    expect(activity.skills).toStrictEqual(['tdd', 'commit']);
  });

  it('un Subagente sin Eventos propios aporta las de su Transcript', () => {
    expect(ownActivity([], [use('k9', 'review')]).skills).toStrictEqual(['review']);
  });
});

const launch = (overrides: Partial<LaunchRecord> = {}): LaunchRecord => ({
  type: 'Explore',
  launcher: null,
  session_id: 's1',
  project: 'demo',
  subagent_id: 'a1',
  tool_use_id: 't1',
  description: 'Explorar',
  status: 'finished',
  background: false,
  started_at: at(30),
  stopped_at: at(27),
  duration_ms: 180_000,
  tool_count: 4,
  tool_errors: 1,
  blocks: 0,
  model: 'claude-haiku-4-5',
  tokens: { input: 100, output: 1000, cache_read: 0, cache_creation: 0 },
  estimated_cost_usd: 0.01,
  cache_hit_rate: null,
  cache_savings_net_usd: null,
  result: 'Hecho',
  tools: [{ name: 'Read', calls: 4, errors: 1, blocks: 0 }],
  skills: [],
  mcp: [],
  tests: { passed: 0, failed: 0 },
  ...overrides,
});

describe('AC-46: comparativa de Tipos de Subagente', () => {
  it('resume cada Tipo y los ordena por Lanzamientos', () => {
    const summaries = agentSummaries([
      launch({ duration_ms: 100_000, started_at: at(50) }),
      launch({ session_id: 's2', project: 'lucia', duration_ms: 300_000, background: true, estimated_cost_usd: 0.03, blocks: 2, started_at: at(20) }),
      launch({ status: 'running', stopped_at: null, duration_ms: 60_000, estimated_cost_usd: null, tokens: null, started_at: at(5) }),
      launch({ type: 'Plan', status: 'no_response', stopped_at: null }),
      launch({ type: null }),
    ]);

    expect(summaries.map((s) => s.type)).toStrictEqual(['Explore', 'Plan', null]);
    expect(summaries[0]).toStrictEqual({
      type: 'Explore',
      launches: 3,
      running: 1,
      no_response: 0,
      foreground: 2,
      background: 1,
      duration_p50_ms: 100_000,
      duration_p95_ms: 300_000,
      tokens: { input: 200, output: 2000, cache_read: 0, cache_creation: 0 },
      estimated_cost_usd: 0.04,
      cost_per_launch_usd: 0.02,
      tool_errors_per_launch: 1,
      blocks_per_launch: 2 / 3,
      // Recibieron entrada pero no leyeron nada de caché: 0 %, no sin datos.
      cache_hit_rate: 0,
      cache_savings_net_usd: 0,
      rated_up: 0,
      rated_down: 0,
      sessions: 2,
      projects: ['demo', 'lucia'],
      last_at: at(5),
    });
    expect(summaries[1]).toMatchObject({ launches: 1, no_response: 1, duration_p50_ms: null, cost_per_launch_usd: 0.01 });
  });

  it('AC-73: la tasa de caché usa los tokens de todos los Lanzamientos y el ahorro suma los de cada uno', () => {
    const [summary] = agentSummaries([
      launch({ tokens: { input: 100, output: 1, cache_read: 900, cache_creation: 0 }, cache_savings_net_usd: 0.5 }),
      launch({ tokens: { input: 900, output: 1, cache_read: 100, cache_creation: 0 }, cache_savings_net_usd: -0.2 }),
      launch({ tokens: null, cache_savings_net_usd: null }),
    ]);
    // No es la media de 0,9 y 0,1 por casualidad: se calcula con los tokens sumados.
    expect(summary!.cache_hit_rate).toBeCloseTo(0.5, 10);
    expect(summary!.cache_savings_net_usd).toBeCloseTo(0.3, 6);
  });

  it('AC-73: sin tokens de entrada la tasa es null y el ahorro 0', () => {
    const [summary] = agentSummaries([launch({ tokens: null })]);
    expect(summary).toMatchObject({ cache_hit_rate: null, cache_savings_net_usd: 0 });
  });

  it('AC-59: cuenta los Lanzamientos con Subagente bien y mal puntuado', () => {
    const [summary] = agentSummaries([launch({ rating: 1 }), launch({ rating: 1 }), launch({ rating: -1 }), launch({ rating: null }), launch({})]);
    expect(summary).toMatchObject({ launches: 5, rated_up: 2, rated_down: 1 });
  });
});

describe('AC-46: perfil de un Tipo', () => {
  it('reúne quién lo lanza, modelos, herramientas, skills, MCP, tests y sus Lanzamientos', () => {
    const profile = agentProfile([
      launch({ started_at: at(50), skills: ['tdd'], tests: { passed: 1, failed: 0 } }),
      launch({
        started_at: at(20),
        launcher: 'orchestrator',
        model: 'claude-sonnet-5',
        tools: [
          { name: 'Read', calls: 1, errors: 0, blocks: 0 },
          { name: 'Bash', calls: 3, errors: 2, blocks: 1 },
        ],
        skills: ['tdd', 'domain-modeling'],
        mcp: [{ server: 'playwright', calls: 2, errors: 1 }],
        tests: { passed: 0, failed: 2 },
      }),
    ]);

    expect(profile.summary).toMatchObject({ type: 'Explore', launches: 2 });
    expect(profile.launched_by).toStrictEqual([
      { launcher: null, launches: 1 },
      { launcher: 'orchestrator', launches: 1 },
    ]);
    expect(profile.models).toStrictEqual([
      { model: 'claude-haiku-4-5', launches: 1 },
      { model: 'claude-sonnet-5', launches: 1 },
    ]);
    expect(profile.tools).toStrictEqual([
      { name: 'Read', calls: 5, errors: 1, blocks: 0 },
      { name: 'Bash', calls: 3, errors: 2, blocks: 1 },
    ]);
    expect(profile.skills).toStrictEqual([
      { skill: 'tdd', invocations: 2 },
      { skill: 'domain-modeling', invocations: 1 },
    ]);
    expect(profile.mcp_servers).toStrictEqual([{ server: 'playwright', calls: 2, errors: 1 }]);
    expect(profile.test_runs).toStrictEqual({ total: 3, passed: 1, failed: 2 });
    expect(profile.launches.map((l) => l.started_at)).toStrictEqual([at(20), at(50)]);
    expect(profile.launches[0]).not.toHaveProperty('tools');
    expect(profile.launches[0]).not.toHaveProperty('type');
  });

  it('sin Lanzamientos devuelve cifras a cero para el Tipo pedido', () => {
    const profile = agentProfile([], 'Plan');
    expect(profile.summary).toMatchObject({ type: 'Plan', launches: 0, sessions: 0, cost_per_launch_usd: null });
    expect(profile.launches).toStrictEqual([]);
  });
});
