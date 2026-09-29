import type { EventType } from '../src/domain/event.js';
import {
  parseSkillUses,
  parseSlashCommand,
  skillInvocationsOfSession,
  transcriptSkillInvocations,
  skillUsage,
  type SkillEventRow,
  type SkillInvocation,
} from '../src/domain/skill-invocations.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

let seq = 0;
function row(eventType: EventType, minutesAgo: number, overrides: Partial<SkillEventRow> = {}): SkillEventRow {
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

const prompt = (minutesAgo: number, text: string) => row('prompt.submitted', minutesAgo, { payload: { prompt: text } });

// Eventos reales de Claude Code: `Skill` solo carga instrucciones y termina en milisegundos.
const skillPre = (minutesAgo: number, input: Record<string, unknown>, toolUseId: string, subagent: string | null = null) =>
  row('tool.pre', minutesAgo, { tool_name: 'Skill', subagent_id: subagent, payload: { tool_input: input, tool_use_id: toolUseId } });
const skillPost = (minutesAgo: number, toolUseId: string, extra: Record<string, unknown> = {}, subagent: string | null = null) =>
  row('tool.post', minutesAgo, {
    tool_name: 'Skill',
    subagent_id: subagent,
    payload: { tool_use_id: toolUseId, tool_response: { success: true, commandName: 'x' }, ...extra },
  });

const only = (items: SkillInvocation[]) => {
  expect(items).toHaveLength(1);
  return items[0]!;
};

describe('AC-29: prompts /nombre', () => {
  it.each([
    ['/commit', { skill: 'commit', args: null }],
    ['  /grilling Punto 1.6 del roadmap', { skill: 'grilling', args: 'Punto 1.6 del roadmap' }],
    ['/anthropic-skills:pdf', { skill: 'anthropic-skills:pdf', args: null }],
    ['/tdd arregla el bug\nsegunda línea', { skill: 'tdd', args: 'arregla el bug' }],
  ])('"%s" es una invocación de la persona usuaria', (text, expected) => {
    expect(parseSlashCommand(text)).toEqual(expected);
  });

  it.each([['/spec/roadmap'], ['Haz el punto 1.6 de /spec/roadmap /grill-with-docs'], ['ver /commit'], ['/'], ['/ algo'], ['']])(
    '"%s" no cuenta',
    (text) => {
      expect(parseSlashCommand(text)).toBeNull();
    },
  );

  it('ignora lo que no es texto', () => {
    expect(parseSlashCommand(undefined)).toBeNull();
    expect(parseSlashCommand(42)).toBeNull();
  });
});

describe('AC-29: Invocaciones de skill de una Sesión', () => {
  it('una /nombre queda en curso hasta el fin de su Turno y después terminada con esa duración', () => {
    const running = only(skillInvocationsOfSession([prompt(10, '/commit'), row('tool.pre', 9)], NOW));
    expect(running).toMatchObject({ skill: 'commit', invoker: 'user', status: 'running', turn: 1, ended_at: null, duration_ms: null });

    const events = [prompt(10, '/commit'), row('tool.pre', 9), row('turn.ended', 4)];
    const finished = only(skillInvocationsOfSession(events, NOW));
    expect(finished).toMatchObject({
      id: events[0]!.id,
      event_id: events[0]!.id,
      status: 'finished',
      started_at: at(10),
      ended_at: at(4),
      duration_ms: 6 * 60_000,
      args: null,
      error: null,
      subagent_id: null,
      subagent_type: null,
    });
  });

  it('el agente carga una skill con la herramienta Skill en el Turno en curso', () => {
    const events = [
      prompt(20, 'hola'),
      row('turn.ended', 19),
      prompt(10, 'Haz el punto 1.6'),
      skillPre(9, { skill: 'grilling', args: 'Punto 1.6' }, 't1'),
      skillPost(9, 't1'),
      row('turn.ended', 2),
    ];
    expect(only(skillInvocationsOfSession(events, NOW))).toMatchObject({
      id: events[3]!.id,
      skill: 'grilling',
      args: 'Punto 1.6',
      invoker: 'agent',
      turn: 2,
      status: 'finished',
      started_at: at(9),
      ended_at: at(2),
      duration_ms: 7 * 60_000,
    });
  });

  it('una skill de un Subagente dura hasta que el Subagente termina y lleva su tipo', () => {
    const events = [
      prompt(10, 'delega'),
      row('subagent.started', 9, { subagent_id: 'a1', payload: { agent_type: 'e2e-builder' } }),
      skillPre(8, { skill: 'tdd' }, 't1', 'a1'),
      skillPost(8, 't1', {}, 'a1'),
      row('subagent.stopped', 5, { subagent_id: 'a1', payload: { agent_type: 'e2e-builder' } }),
    ];
    expect(only(skillInvocationsOfSession(events, NOW))).toMatchObject({
      invoker: 'subagent',
      subagent_id: 'a1',
      subagent_type: 'e2e-builder',
      turn: 1,
      status: 'finished',
      ended_at: at(5),
      duration_ms: 3 * 60_000,
    });
  });

  it.each([
    ['success: false', { tool_response: { success: false } }, null],
    ['un error', { error: 'Unknown skill: nope\nmás detalle' }, 'Unknown skill: nope'],
  ])('queda fallida si el tool.post trae %s', (_name, extra, error) => {
    const events = [prompt(10, 'x'), skillPre(9, { skill: 'nope' }, 't1'), skillPost(9, 't1', extra), row('turn.ended', 2)];
    expect(only(skillInvocationsOfSession(events, NOW))).toMatchObject({ status: 'failed', error, ended_at: null, duration_ms: null });
  });

  it('en una Sesión Cerrada o Huérfana sin cerrar el Turno queda terminada sin duración', () => {
    const closed = [prompt(10, '/commit'), row('session.ended', 9)];
    expect(only(skillInvocationsOfSession(closed, NOW))).toMatchObject({ status: 'finished', ended_at: null, duration_ms: null });

    const orphaned = [prompt(60, '/commit'), row('tool.pre', 55)];
    expect(only(skillInvocationsOfSession(orphaned, NOW))).toMatchObject({ status: 'finished', duration_ms: null });
  });

  it('resume los argumentos en una línea y devuelve la más reciente primero', () => {
    const events = [
      prompt(10, 'x'),
      skillPre(9, { skill: 'a', args: `primera línea\nsegunda ${'x'.repeat(200)}` }, 't1'),
      skillPre(8, { skill: 'b' }, 't2'),
    ];
    const items = skillInvocationsOfSession(events, NOW);
    expect(items.map((i) => i.skill)).toEqual(['b', 'a']);
    expect(items[1]!.args).toBe('primera línea');
  });

  it('un Evento mal formado no rompe la lectura', () => {
    const events = [
      prompt(10, 'x'),
      row('tool.pre', 9, { tool_name: 'Skill', payload: { tool_input: 'roto' } }),
      row('tool.pre', 8, { tool_name: 'Skill' }),
      row('prompt.submitted', 7),
      skillPre(6, { skill: '' }, 't3'),
    ];
    expect(skillInvocationsOfSession(events, NOW)).toEqual([]);
  });

  it('otras herramientas no son invocaciones', () => {
    const events = [prompt(10, 'x'), row('tool.pre', 9, { tool_name: 'Bash', payload: { tool_input: { skill: 'no' } } })];
    expect(skillInvocationsOfSession(events, NOW)).toEqual([]);
  });
});

describe('AC-30: uso agregado por Proyecto y skill', () => {
  const inv = (project: string, skill: string, invoker: SkillInvocation['invoker'], minutesAgo: number) =>
    ({ project, skill, invoker, started_at: at(minutesAgo) }) as SkillInvocation;

  it('cuenta por quién la invocó, guarda la última y ordena por total', () => {
    const stats = skillUsage([
      inv('demo', 'tdd', 'agent', 1),
      inv('demo', 'commit', 'user', 2),
      inv('demo', 'tdd', 'subagent', 3),
      inv('otro', 'tdd', 'user', 4),
      inv('demo', 'tdd', 'user', 5),
    ]);
    expect(stats).toEqual([
      { project: 'demo', skill: 'tdd', total: 3, by_invoker: { agent: 1, subagent: 1, user: 1 }, last_at: at(1) },
      { project: 'demo', skill: 'commit', total: 1, by_invoker: { agent: 0, subagent: 0, user: 1 }, last_at: at(2) },
      { project: 'otro', skill: 'tdd', total: 1, by_invoker: { agent: 0, subagent: 0, user: 1 }, last_at: at(4) },
    ]);
  });
});

describe('AC-29: skills del Transcript', () => {
  // Líneas reales de Claude Code, recortadas: el agente pide la Skill y el resultado vuelve en el siguiente mensaje.
  const toolUse = (id: string, input: Record<string, unknown>, timestamp: string) =>
    JSON.stringify({ type: 'assistant', timestamp, message: { content: [{ type: 'tool_use', id, name: 'Skill', input }] } });
  const toolResult = (id: string, isError = false, content = 'Launching skill') =>
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content }] } });

  it('lee cada tool_use de Skill con su resultado', () => {
    const jsonl = [
      toolUse('t1', { skill: 'tdd', args: 'arregla el login\nmás' }, at(9)),
      toolResult('t1'),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'r1', name: 'Read', input: {} }] } }),
      toolUse('t2', { skill: 'nope' }, at(8)),
      toolResult('t2', true, 'Unknown skill: nope\ndetalle'),
      '{ roto',
      toolUse('t3', { skill: '' }, at(7)),
    ].join('\n');

    expect(parseSkillUses(jsonl)).toStrictEqual([
      { tool_use_id: 't1', skill: 'tdd', args: 'arregla el login', timestamp: at(9), error: null, failed: false },
      { tool_use_id: 't2', skill: 'nope', args: null, timestamp: at(8), error: 'Unknown skill: nope', failed: true },
    ]);
  });

  const use = (id: string, skill: string, minutesAgo: number, failed = false) => ({
    tool_use_id: id,
    skill,
    args: null,
    timestamp: at(minutesAgo),
    error: failed ? 'Unknown skill' : null,
    failed,
  });

  it('añade las del agente y de cada Subagente que el hook no envió, sin duplicar', () => {
    const rows = [
      prompt(20, 'hola'),
      skillPre(19, { skill: 'grilling' }, 't1'),
      row('turn.ended', 15),
      prompt(10, 'delega'),
      row('subagent.started', 9, { subagent_id: 'a1', payload: { agent_type: 'ui-builder' } }),
      row('subagent.stopped', 4, { subagent_id: 'a1' }),
      row('turn.ended', 3),
    ].map((r) => (r.tool_name === 'Skill' ? { ...r, tool_use_id: 't1' } : r));
    const fromEvents = skillInvocationsOfSession(rows, NOW);

    const items = transcriptSkillInvocations({
      rows,
      now: NOW,
      fromEvents,
      main: [use('t1', 'grilling', 19), use('t2', 'domain-modeling', 17)],
      subagents: [{ agentId: 'a1', agentType: 'ui-builder', uses: [use('t3', 'ui-lucia-element-table', 8), use('t4', 'nope', 7, true)] }],
    });

    expect(items.map((i) => [i.skill, i.invoker, i.status, i.turn])).toStrictEqual([
      ['nope', 'subagent', 'failed', 2],
      ['ui-lucia-element-table', 'subagent', 'finished', 2],
      ['domain-modeling', 'agent', 'finished', 1],
    ]);
    expect(items[1]).toMatchObject({
      id: 'transcript:t3',
      event_id: null,
      subagent_id: 'a1',
      subagent_type: 'ui-builder',
      ended_at: at(4),
      duration_ms: 4 * 60_000,
      project: 'demo',
      session_id: 's1',
    });
    expect(items[2]).toMatchObject({ ended_at: at(15), duration_ms: 2 * 60_000 });
    expect(items[0]).toMatchObject({ error: 'Unknown skill', ended_at: null });
  });

  it('no cuenta dos veces una /nombre de la persona usuaria que también quedó en el Transcript', () => {
    const rows = [prompt(10, '/commit'), row('turn.ended', 5)];
    const items = transcriptSkillInvocations({ rows, now: NOW, fromEvents: skillInvocationsOfSession(rows, NOW), main: [use('t1', 'commit', 9)], subagents: [] });
    expect(items).toStrictEqual([]);
  });

  it('un Subagente sin Eventos propios termina sin duración conocida', () => {
    const rows = [prompt(10, 'delega'), row('turn.ended', 2)];
    const [item] = transcriptSkillInvocations({
      rows,
      now: NOW,
      fromEvents: [],
      main: [],
      subagents: [{ agentId: 'zz', agentType: null, uses: [use('t1', 'tdd', 8)] }],
    });
    expect(item).toMatchObject({ invoker: 'subagent', subagent_id: 'zz', status: 'finished', ended_at: null, duration_ms: null });
  });
});
