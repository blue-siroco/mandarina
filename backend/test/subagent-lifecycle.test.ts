import type { EventType } from '../src/domain/event.js';
import type { SessionEventRow } from '../src/domain/session-summary.js';
import { hintsOf, subagentLives } from '../src/domain/subagent-lifecycle.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

let seq = 0;
function row(eventType: EventType, minutesAgo: number, overrides: Partial<SessionEventRow> = {}): SessionEventRow {
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

// Pistas tal como las extrae el repositorio del payload real de Claude Code.
const launch = (minutesAgo: number, toolUseId: string, type: string, description = `tarea ${toolUseId}`) =>
  row('tool.pre', minutesAgo, { tool_name: 'Agent', tool_use_id: toolUseId, launch_type: type, launch_description: description });
const launched = (minutesAgo: number, toolUseId: string, agentId: string | null, status = 'completed') =>
  row('tool.post', minutesAgo, { tool_name: 'Agent', tool_use_id: toolUseId, launched_agent_id: agentId, response_status: status });
const started = (minutesAgo: number, id: string, type: string | null) => row('subagent.started', minutesAgo, { subagent_id: id, agent_type: type });
const stopped = (minutesAgo: number, id: string, type: string | null) => row('subagent.stopped', minutesAgo, { subagent_id: id, agent_type: type });
const ownTool = (minutesAgo: number, id: string) => row('tool.pre', minutesAgo, { subagent_id: id, tool_name: 'Read' });

describe('AC-33: ciclo de vida del Subagente', () => {
  it('enlaza el lanzamiento, el inicio, la actividad, el fin y el tool.post de un Subagente en primer plano', () => {
    const pre = launch(10, 't1', 'Explore', 'Explorar el repositorio');
    const start = started(9, 'a1', 'Explore');
    const stop = stopped(4, 'a1', 'Explore');
    const lives = subagentLives([row('prompt.submitted', 11), pre, start, ownTool(8, 'a1'), ownTool(7, 'a1'), stop, launched(4, 't1', 'a1')]);

    expect(lives).toStrictEqual([
      {
        key: 'a1',
        subagent_id: 'a1',
        tool_use_id: 't1',
        agent_type: 'Explore',
        description: 'Explorar el repositorio',
        launch_event_id: pre.id,
        start_event_id: start.id,
        stop_event_id: stop.id,
        started_at: at(10),
        stopped_at: at(4),
        internal: false,
        tool_count: 2,
      },
    ]);
  });

  it('un lanzamiento sin Subagente es un Subagente pendiente, en marcha', () => {
    const [life] = subagentLives([launch(3, 't1', 'Plan')]);
    expect(life).toMatchObject({ key: 'launch:t1', subagent_id: null, tool_use_id: 't1', agent_type: 'Plan', stopped_at: null, internal: false });
  });

  it('el tool.post síncrono termina un lanzamiento cuyo SubagentStop se perdió; el de segundo plano no', () => {
    expect(subagentLives([launch(5, 't1', 'Plan'), launched(2, 't1', null)])[0]).toMatchObject({ stopped_at: at(2) });

    const background = subagentLives([launch(5, 't2', 'Explore'), launched(5, 't2', 'a2', 'async_launched'), started(4, 'a2', 'Explore')]);
    expect(background).toHaveLength(1);
    expect(background[0]).toMatchObject({ subagent_id: 'a2', tool_use_id: 't2', stopped_at: null });
  });

  it('sin SubagentStart, el Subagente se empareja por Tipo con su lanzamiento y empieza con él', () => {
    const lives = subagentLives([launch(10, 't1', 'Plan'), ownTool(8, 'a1'), stopped(6, 'a1', 'Plan')]);
    expect(lives).toHaveLength(1);
    expect(lives[0]).toMatchObject({ subagent_id: 'a1', tool_use_id: 't1', started_at: at(10), stopped_at: at(6), start_event_id: null });
  });

  it('con dos lanzamientos del mismo Tipo en paralelo, el enlace exacto manda y el resto se empareja por orden', () => {
    const lives = subagentLives([
      launch(10, 't1', 'Explore'),
      launch(10, 't2', 'Explore'),
      started(9, 'a1', 'Explore'),
      started(9, 'a2', 'Explore'),
      launched(5, 't2', 'a1'),
    ]);
    expect(lives.map((l) => [l.subagent_id, l.tool_use_id])).toStrictEqual([
      ['a1', 't2'],
      ['a2', 't1'],
    ]);
  });

  it('usa el toolUseId del .meta.json del Transcript como enlace exacto, sin el prefijo agent-', () => {
    const lives = subagentLives(
      [launch(11, 't1', 'Explore'), launch(10, 't2', 'Explore'), started(9, 'agent-a1', 'Explore')],
      new Map([['t2', 'a1']]),
    );
    expect(lives.map((l) => [l.subagent_id, l.tool_use_id])).toStrictEqual([
      [null, 't1'],
      ['agent-a1', 't2'],
    ]);
  });

  it('no empareja con un lanzamiento de otro Tipo ni posterior al Subagente', () => {
    const lives = subagentLives([started(9, 'a1', 'Explore'), launch(8, 't1', 'Explore'), launch(7, 't2', 'Plan')]);
    expect(lives.map((l) => [l.subagent_id, l.tool_use_id])).toStrictEqual([
      ['a1', null],
      [null, 't1'],
      [null, 't2'],
    ]);
  });

  it('un Subagente con solo SubagentStop, sin Tipo y sin lanzamiento es interno', () => {
    const lives = subagentLives([row('prompt.submitted', 5), stopped(4, 'x1', ''), stopped(3, 'x2', 'Explore'), stopped(2, 'x3', null)]);
    expect(lives.map((l) => [l.subagent_id, l.internal])).toStrictEqual([
      ['x1', true],
      ['x2', false],
      ['x3', true],
    ]);
  });

  it('el Tipo sale del inicio, del fin y del lanzamiento, en ese orden', () => {
    const lives = subagentLives([launch(10, 't1', 'general-purpose'), started(9, 'a1', null), stopped(4, 'a1', 'Plan'), launched(4, 't1', 'a1')]);
    expect(lives[0]!.agent_type).toBe('Plan');
    expect(subagentLives([launch(10, 't1', 'general-purpose'), launched(9, 't1', 'a1', 'async_launched'), ownTool(8, 'a1')])[0]!.agent_type).toBe(
      'general-purpose',
    );
  });

  it('ordena los Subagentes por inicio', () => {
    const lives = subagentLives([started(9, 'b', 'Explore'), launch(10, 't1', 'Plan'), started(5, 'a', 'Explore')]);
    expect(lives.map((l) => l.key)).toStrictEqual(['launch:t1', 'b', 'a']);
  });
});

describe('AC-33: pistas del payload', () => {
  it('extrae del payload nativo lo que necesita el ciclo de vida', () => {
    expect(
      hintsOf('tool.pre', 'Agent', { tool_use_id: 't1', tool_input: { subagent_type: 'Explore', description: 'Explorar', prompt: '…' } }),
    ).toStrictEqual({
      agent_type: null,
      tool_use_id: 't1',
      launch_type: 'Explore',
      launch_description: 'Explorar',
      launched_agent_id: null,
      response_status: null,
      launch_background: false,
      tool_error: false,
      skill_name: null,
      session_agent_type: null,
    });
    expect(hintsOf('tool.post', 'Task', { tool_use_id: 't1', tool_response: { status: 'async_launched', agentId: 'a1' } })).toMatchObject({
      launched_agent_id: 'a1',
      response_status: 'async_launched',
    });
    expect(hintsOf('subagent.stopped', null, { agent_type: 'Plan', agent_id: 'a1' })).toMatchObject({ agent_type: 'Plan' });
    expect(hintsOf('tool.pre', 'Bash', { tool_input: 'roto' })).toMatchObject({ launch_type: null, tool_use_id: null });
  });

  it('AC-45: segundo plano, fallos de herramienta, skill y agente de la Sesión', () => {
    expect(hintsOf('tool.pre', 'Agent', { tool_input: { subagent_type: 'Explore', run_in_background: true } }).launch_background).toBe(true);
    expect(hintsOf('tool.post', 'Bash', { error: 'Exit code 1' }).tool_error).toBe(true);
    expect(hintsOf('tool.post', 'Bash', { error: 'Interrupted', is_interrupt: true }).tool_error).toBe(false);
    expect(hintsOf('tool.post', 'Bash', { tool_response: { stdout: 'ok' } }).tool_error).toBe(false);
    expect(hintsOf('tool.pre', 'Skill', { tool_input: { skill: 'tdd' } }).skill_name).toBe('tdd');
    // Los Eventos de un Subagente también traen `agent_type`: solo cuenta el del agente principal.
    expect(hintsOf('prompt.submitted', null, { agent_type: 'orchestrator' }).session_agent_type).toBe('orchestrator');
    expect(hintsOf('tool.pre', 'Read', { agent_type: 'Explore' }, 'a1').session_agent_type).toBeNull();
  });
});
