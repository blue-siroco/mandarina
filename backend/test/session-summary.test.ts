import type { EventType } from '../src/domain/event.js';
import { compareSessions, summarizeSession, type SessionEventRow } from '../src/domain/session-summary.js';
import { summarizeToolInput } from '../src/domain/tool-summary.js';
import { contextWindow } from '../src/domain/context-window.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const at = (minutesAgo: number, seconds = 0) => new Date(NOW.getTime() - minutesAgo * 60_000 + seconds * 1000).toISOString();

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

describe('AC-14: Estado de la Sesión', () => {
  it.each([
    ['con session.ended está Cerrada', [row('session.started', 3), row('session.ended', 2)], 'closed'],
    ['con un Evento hace 2 min está Activa', [row('prompt.submitted', 3), row('turn.ended', 2)], 'active'],
    ['en pausa y sin Eventos en 10 min está Inactiva', [row('prompt.submitted', 12), row('turn.ended', 10)], 'idle'],
    ['con un Turno en curso sigue Activa aunque lleve 10 min en silencio', [row('prompt.submitted', 11), row('tool.pre', 10)], 'active'],
    ['sin actividad en más de 30 min está Huérfana', [row('prompt.submitted', 45), row('tool.pre', 40)], 'orphaned'],
  ])('%s', (_name, rows, expected) => {
    expect(summarizeSession(rows, NOW).state).toBe(expected);
  });

  describe('una Sesión Cerrada que se retoma vuelve a estar viva', () => {
    // `claude --resume` / `--continue` reutilizan el session_id: tras un session.ended llegan Eventos nuevos.
    it.each([
      ['un session.started de reanudación', () => row('session.started', 1)],
      ['un prompt nuevo', () => row('prompt.submitted', 1)],
      ['una herramienta', () => row('tool.pre', 1)],
    ])('con %s tras el cierre está Activa', (_name, resume) => {
      const summary = summarizeSession([row('session.started', 30), row('turn.ended', 20), row('session.ended', 10), resume()], NOW);
      expect(summary.state).toBe('active');
      expect(summary.activity).not.toBeNull();
    });

    it('conserva su Actividad: Trabajando si retoma con un Turno en curso', () => {
      const rows = [row('session.ended', 10), row('session.started', 2), row('prompt.submitted', 1), row('tool.pre', 1)];
      expect(summarizeSession(rows, NOW)).toMatchObject({ state: 'active', activity: 'working' });
    });

    it('si tras retomarla se vuelve a cerrar, está Cerrada', () => {
      const rows = [row('session.ended', 30), row('session.started', 20), row('turn.ended', 10), row('session.ended', 5)];
      expect(summarizeSession(rows, NOW).state).toBe('closed');
    });

    it('los Eventos de cola de un cierre no la reabren', () => {
      const rows = [row('prompt.submitted', 10), row('session.ended', 3), row('subagent.stopped', 3), row('turn.ended', 3)];
      expect(summarizeSession(rows, NOW).state).toBe('closed');
    });

    it('si se retoma y luego se abandona, acaba Huérfana y no Cerrada', () => {
      const rows = [row('session.ended', 90), row('session.started', 60), row('tool.pre', 50)];
      expect(summarizeSession(rows, NOW).state).toBe('orphaned');
    });
  });

  it('la escritura reciente del Transcript evita que sea Huérfana', () => {
    const rows = [row('prompt.submitted', 45), row('tool.pre', 40)];
    const summary = summarizeSession(rows, NOW, NOW.getTime() - 60_000);
    expect(summary.state).toBe('active');
    expect(summary.last_activity_at).toBe(at(1));
  });

  it('la Actividad solo existe en Sesiones Activas o Inactivas', () => {
    expect(summarizeSession([row('turn.ended', 1)], NOW).activity).toBe('paused');
    expect(summarizeSession([row('tool.pre', 1)], NOW).activity).toBe('working');
    expect(summarizeSession([row('tool.pre', 50)], NOW).activity).toBeNull();
    expect(summarizeSession([row('session.ended', 1)], NOW).activity).toBeNull();
  });
});

describe('AC-14: Turnos y duraciones', () => {
  it('suma los Turnos como Duración activa y descuenta las pausas', () => {
    const rows = [
      row('session.started', 60),
      row('prompt.submitted', 50),
      row('tool.pre', 49, { tool_name: 'Bash' }),
      row('tool.post', 48, { tool_name: 'Bash' }),
      row('turn.ended', 45),
      row('prompt.submitted', 20),
      row('tool.pre', 19, { subagent_id: 'agent-1' }),
      row('turn.ended', 10),
    ];
    const summary = summarizeSession(rows, NOW);

    expect(summary.turns.map((t) => [t.index, t.duration_ms / 60_000, t.tool_count])).toStrictEqual([
      [1, 5, 1],
      [2, 10, 1],
    ]);
    expect(summary.active_duration_ms).toBe(15 * 60_000);
    expect(summary.clock_duration_ms).toBe(50 * 60_000);
  });

  it('un prompt sin turn.ended previo cierra el Turno anterior', () => {
    const rows = [row('prompt.submitted', 10), row('prompt.submitted', 6), row('turn.ended', 4)];
    expect(summarizeSession(rows, NOW).turns.map((t) => t.duration_ms / 60_000)).toStrictEqual([4, 2]);
  });

  it('un Turno en curso no tiene fin y dura hasta el último Evento', () => {
    const rows = [row('prompt.submitted', 10), row('tool.pre', 3)];
    const [turn] = summarizeSession(rows, NOW).turns;
    expect(turn).toMatchObject({ ended_at: null, duration_ms: 7 * 60_000 });
  });

  it('los prompts de un Subagente no abren Turnos', () => {
    const rows = [row('prompt.submitted', 10, { subagent_id: 'a' }), row('turn.ended', 5)];
    expect(summarizeSession(rows, NOW).turns).toHaveLength(0);
  });
});

describe('AC-15: resumen para el board', () => {
  it('cuenta Eventos, herramientas, prompts, Subagentes y Bloqueos', () => {
    const rows = [
      row('prompt.submitted', 5),
      row('tool.pre', 4, { tool_name: 'Read' }),
      row('subagent.started', 4, { subagent_id: 'a1' }),
      row('subagent.started', 4, { subagent_id: 'a2' }),
      row('subagent.stopped', 3, { subagent_id: 'a2' }),
      row('tool.blocked', 2, { tool_name: 'Bash' }),
    ];
    expect(summarizeSession(rows, NOW)).toMatchObject({
      event_count: 6,
      tool_count: 1,
      prompt_count: 1,
      subagent_count: 2,
      running_subagents: 1,
      block_count: 1,
    });
  });

  it('localiza la herramienta en curso por carril', () => {
    const main = row('tool.pre', 3, { tool_name: 'Bash' });
    const rows = [
      row('prompt.submitted', 5),
      main,
      row('tool.pre', 2, { tool_name: 'Read', subagent_id: 'a1' }),
      row('tool.post', 1, { tool_name: 'Read', subagent_id: 'a1' }),
    ];
    expect(summarizeSession(rows, NOW).open_tool_event_id).toBe(main.id);
  });

  it('reparte los Eventos de la última hora en 12 intervalos de 5 min', () => {
    const rows = [row('tool.pre', 70), row('tool.pre', 58), row('tool.pre', 2), row('tool.post', 1)];
    const { sparkline } = summarizeSession(rows, NOW);
    expect(sparkline).toHaveLength(12);
    expect(sparkline[0]).toBe(1);
    expect(sparkline[11]).toBe(2);
    expect(sparkline.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('ordena por inicio, la más nueva primero, sin mirar Estado ni actividad', () => {
    const s = (session_id: string, startedMinutesAgo: number) => ({ session_id, started_at: at(startedMinutesAgo) });
    const sorted = [s('vieja', 90), s('nueva', 1), s('b-empate', 30), s('a-empate', 30)].sort(compareSessions);
    expect(sorted.map((x) => x.session_id)).toStrictEqual(['nueva', 'a-empate', 'b-empate', 'vieja']);
  });

  it('expone la herramienta abierta de cada carril y los Subagentes en marcha', () => {
    const subPre = row('tool.pre', 2, { tool_name: 'Grep', subagent_id: 'a1' });
    const start = row('subagent.started', 3, { subagent_id: 'a1' });
    const rows = [row('prompt.submitted', 5), start, subPre, row('subagent.started', 3, { subagent_id: 'a2' }), row('subagent.stopped', 1, { subagent_id: 'a2' })];
    const summary = summarizeSession(rows, NOW);

    expect(summary.running_subagents_list.map((s) => s.subagent_id)).toStrictEqual(['a1']);
    expect(summary.open_tools).toStrictEqual({ a1: subPre.id });
    expect(summary.running_subagents_list[0]!.start_event_id).toBe(start.id);
  });
});

describe('AC-15, AC-31: summarizeToolInput', () => {
  it.each([
    ['Bash', { command: 'npm test\nnpm run lint' }, 'npm test'],
    ['Read', { file_path: '/code/a.ts' }, '/code/a.ts'],
    ['Grep', { pattern: 'TODO', path: 'src' }, 'TODO'],
    ['Task', { description: 'Explorar', prompt: '...' }, 'Explorar'],
    ['Skill', { args: 'Punto 1.6', skill: 'grilling' }, 'grilling'],
    ['mcp__x__y', { query: 'algo' }, 'algo'],
  ])('%s', (tool, input, expected) => {
    expect(summarizeToolInput(tool, { tool_input: input })).toBe(expected);
  });

  it('recorta a una línea de 80 caracteres', () => {
    const summary = summarizeToolInput('Bash', { tool_input: { command: 'x'.repeat(200) } });
    expect(summary).toHaveLength(80);
    expect(summary?.endsWith('…')).toBe(true);
  });

  it('sin entrada devuelve null', () => {
    expect(summarizeToolInput('Bash', {})).toBeNull();
  });
});

describe('AC-18: contextWindow', () => {
  const entry = (model: string, timestamp: string, input: number, cacheRead = 0) => ({
    messageId: timestamp,
    model,
    timestamp,
    usage: { input, output: 5, cache_read: cacheRead, cache_creation_5m: 10, cache_creation_1h: 0 },
  });

  it('usa la entrada completa de la última respuesta', () => {
    const window = contextWindow([
      entry('claude-haiku-4-5', '2026-09-25T10:00:01.000Z', 100, 50_000),
      entry('claude-haiku-4-5', '2026-09-25T10:00:00.000Z', 1, 1),
    ]);
    expect(window).toStrictEqual({ model: 'claude-haiku-4-5', used: 50_110, limit: 200_000 });
  });

  it('usa la ventana de 1M para los modelos que la tienen o cuando ya se superaron 200K', () => {
    expect(contextWindow([entry('claude-opus-5-5', '2026-09-25T10:00:00.000Z', 10)])?.limit).toBe(1_000_000);
    expect(contextWindow([entry('claude-sonnet-4-5', '2026-09-25T10:00:00.000Z', 300_000)])?.limit).toBe(1_000_000);
  });

  it('sin respuestas no hay ventana', () => {
    expect(contextWindow([])).toBeNull();
  });
});
