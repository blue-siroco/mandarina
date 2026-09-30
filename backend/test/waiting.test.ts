import type { EventType } from '../src/domain/event.js';
import { summarizeSession, type SessionEventRow } from '../src/domain/session-summary.js';
import { hintsOf } from '../src/domain/subagent-lifecycle.js';
import { notificationReason } from '../src/domain/waiting.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

let seq = 0;
// Las pistas salen de `hintsOf`, igual que en el detalle: así el test cubre la extracción del payload.
function row(
  eventType: EventType,
  minutesAgo: number,
  options: { tool?: string; subagent?: string; payload?: Record<string, unknown>; overrides?: Partial<SessionEventRow> } = {},
): SessionEventRow {
  seq += 1;
  return {
    id: `e${seq}`,
    session_id: 's1',
    project: 'demo',
    directory: '/code/demo',
    harness: 'claude-code',
    subagent_id: options.subagent ?? null,
    event_type: eventType,
    tool_name: options.tool ?? null,
    occurred_at: at(minutesAgo),
    received_at: at(minutesAgo),
    transcript_path: null,
    ...hintsOf(eventType, options.tool ?? null, options.payload ?? {}, options.subagent ?? null),
    ...options.overrides,
  };
}

const prompt = (m: number) => row('prompt.submitted', m);
const permission = (m: number, tool = 'Bash', input: Record<string, unknown> = { command: 'rm -rf build' }, subagent?: string) =>
  row('permission.requested', m, { tool, payload: { tool_input: input }, ...(subagent ? { subagent } : {}) });
const notified = (m: number, payload: Record<string, unknown>, subagent?: string) =>
  row('session.notified', m, { payload, ...(subagent ? { subagent } : {}) });
const ask = (m: number, subagent?: string) =>
  row('tool.pre', m, {
    tool: 'AskUserQuestion',
    payload: { tool_input: { questions: [{ question: '¿Qué base de datos usamos?' }] } },
    ...(subagent ? { subagent } : {}),
  });
const summary = (rows: SessionEventRow[]) => summarizeSession(rows, NOW);

describe('AC-88: Esperando por permiso o inactividad', () => {
  it('permission.requested sin Evento posterior deja la Sesión Esperando con herramienta y resumen', () => {
    const s = summary([prompt(3), row('tool.pre', 2, { tool: 'Bash' }), permission(1)]);
    expect(s.activity).toBe('waiting');
    expect(s.waiting).toEqual({ since: at(1), reason: 'permission', tool: 'Bash', summary: 'rm -rf build', subagent: null });
  });

  it('resume la ruta de Edit/Write', () => {
    const s = summary([prompt(3), permission(1, 'Edit', { file_path: 'src/a.ts', new_string: 'x' })]);
    expect(s.waiting).toMatchObject({ tool: 'Edit', summary: 'src/a.ts' });
  });

  it('un Notification de permiso sin permission.requested previo espera con el message y sin herramienta', () => {
    const s = summary([prompt(3), notified(1, { notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' })]);
    expect(s.waiting).toEqual({ since: at(1), reason: 'permission', tool: null, summary: 'Claude needs your permission to use Bash', subagent: null });
  });

  it('AC-91: un Notification de permiso con subagent_id identifica al Subagente', () => {
    const s = summary([
      prompt(5),
      row('subagent.started', 4, { subagent: 'a1', payload: { agent_type: 'Explore' } }),
      notified(1, { notification_type: 'permission_prompt', message: 'Claude needs your permission' }, 'a1'),
    ]);
    expect(s.activity).toBe('waiting');
    expect(s.waiting).toMatchObject({ reason: 'permission', subagent: { id: 'a1', type: 'Explore' } });
  });

  it.each([
    ['PermissionRequest primero', (): SessionEventRow[] => [permission(2), notified(1, { notification_type: 'permission_prompt', message: 'Claude needs your permission' })]],
    ['Notification primero', (): SessionEventRow[] => [notified(2, { notification_type: 'permission_prompt', message: 'Claude needs your permission' }), permission(1)]],
  ])('si llegan ambos (%s) es una sola espera con el inicio del primero y el detalle con herramienta', (_name, events) => {
    const s = summary([prompt(3), ...events()]);
    expect(s.waiting).toEqual({ since: at(2), reason: 'permission', tool: 'Bash', summary: 'rm -rf build', subagent: null });
  });

  it('idle_prompt con un Turno en curso deja la Sesión Esperando por inactividad', () => {
    const s = summary([prompt(3), row('tool.post', 2, { tool: 'Bash' }), notified(1, { notification_type: 'idle_prompt', message: 'Claude is waiting for your input' })]);
    expect(s.activity).toBe('waiting');
    expect(s.waiting).toMatchObject({ since: at(1), reason: 'idle', tool: null });
  });

  it('idle_prompt tras turn.ended no cambia nada: sigue En pausa (Stop no es esperar)', () => {
    const s = summary([prompt(5), row('turn.ended', 3), notified(1, { notification_type: 'idle_prompt', message: 'Claude is waiting for your input' })]);
    expect(s).toMatchObject({ activity: 'paused', waiting: null });
  });

  it('un aviso tras turn.ended tampoco vuelve a poner la Sesión en Trabajando', () => {
    const s = summary([prompt(5), row('turn.ended', 3), notified(1, { notification_type: 'auth_success', message: 'ok' })]);
    expect(s.activity).toBe('paused');
  });

  it.each([
    ['permission', 'Claude needs your permission to use Bash', 'permission'],
    ['waiting for your input', 'Claude is waiting for your input', 'idle'],
  ])('sin notification_type infiere el motivo del message si es inequívoco (%s)', (_name, message, reason) => {
    expect(summary([prompt(3), notified(1, { message })]).waiting).toMatchObject({ reason });
  });

  it('sin notification_type y con un message ambiguo guarda el Evento sin esperar', () => {
    const s = summary([prompt(3), notified(1, { message: 'Hello there' })]);
    expect(s).toMatchObject({ activity: 'working', waiting: null, event_count: 2 });
    expect(notificationReason({ notification_type: null, wait_message: 'permission and waiting for your input' })).toBeNull();
  });

  it('otros notification_type (auth_success) no cambian la Actividad', () => {
    expect(summary([prompt(3), notified(1, { notification_type: 'auth_success', message: 'permission' })])).toMatchObject({ activity: 'working', waiting: null });
  });
});

describe('AC-89: Esperando por pregunta', () => {
  it('un tool.pre de AskUserQuestion sin tool.post espera con el texto de la pregunta desde el tool.pre', () => {
    const s = summary([prompt(3), ask(1)]);
    expect(s.activity).toBe('waiting');
    expect(s.waiting).toEqual({ since: at(1), reason: 'question', tool: 'AskUserQuestion', summary: '¿Qué base de datos usamos?', subagent: null });
    expect(s.open_tool_event_id).not.toBeNull();
  });

  it('sin texto legible el motivo es pregunta sin resumen', () => {
    const s = summary([prompt(3), row('tool.pre', 1, { tool: 'AskUserQuestion', payload: { tool_input: {} } })]);
    expect(s.waiting).toMatchObject({ reason: 'question', summary: null });
  });

  it.each(['tool.post', 'tool.blocked'] as const)('con su %s deja de esperar', (type) => {
    const s = summary([prompt(4), ask(2), row(type, 1, { tool: 'AskUserQuestion' })]);
    expect(s).toMatchObject({ activity: 'working', waiting: null });
  });

  it('una herramienta larga sin tool.post (Bash) no es Esperando', () => {
    expect(summary([prompt(3), row('tool.pre', 1, { tool: 'Bash' })])).toMatchObject({ activity: 'working', waiting: null });
  });

  it('un permission.requested de la misma herramienta es una sola espera: prevalece la pregunta', () => {
    const s = summary([prompt(3), ask(2), permission(1, 'AskUserQuestion', {})]);
    expect(s.waiting).toMatchObject({ since: at(2), reason: 'question', summary: '¿Qué base de datos usamos?' });
  });
});

describe('AC-90: fin de la espera', () => {
  it.each(['tool.post', 'tool.blocked', 'tool.pre'] as const)('%s del mismo carril termina el permiso', (type) => {
    const s = summary([prompt(4), permission(2), row(type, 1, { tool: 'Bash' })]);
    expect(s).toMatchObject({ activity: 'working', waiting: null });
  });

  it('un turn.ended termina la espera y la Sesión queda En pausa sin aviso', () => {
    expect(summary([prompt(4), permission(2), row('turn.ended', 1)])).toMatchObject({ activity: 'paused', waiting: null });
  });

  it('un prompt.submitted la termina', () => {
    expect(summary([prompt(4), permission(2), prompt(1)])).toMatchObject({ activity: 'working', waiting: null });
  });

  it('un session.ended la termina (queda Cerrada)', () => {
    expect(summary([prompt(4), permission(2), row('session.ended', 1)])).toMatchObject({ state: 'closed', activity: null, waiting: null });
  });

  it('otro Notification o PermissionRequest de la misma espera no la reinicia ni la termina', () => {
    const s = summary([
      prompt(5),
      permission(4),
      notified(3, { notification_type: 'permission_prompt', message: 'x' }),
      permission(2),
      notified(1, { notification_type: 'permission_prompt', message: 'y' }),
    ]);
    expect(s.waiting).toMatchObject({ since: at(4), reason: 'permission', tool: 'Bash' });
  });

  it('dos carriles concurrentes: un Evento del agente principal no termina la espera de un Subagente', () => {
    const s = summary([
      prompt(6),
      row('subagent.started', 5, { subagent: 'a1', payload: { agent_type: 'Explore' } }),
      permission(3, 'Bash', { command: 'ls' }, 'a1'),
      row('tool.pre', 2, { tool: 'Read' }),
      row('tool.post', 1, { tool: 'Read' }),
    ]);
    expect(s.activity).toBe('waiting');
    expect(s.waiting).toMatchObject({ since: at(3), subagent: { id: 'a1', type: 'Explore' } });
  });

  it('dos carriles concurrentes: el tool.post del propio carril del Subagente sí la termina', () => {
    const s = summary([
      prompt(6),
      row('subagent.started', 5, { subagent: 'a1', payload: { agent_type: 'Explore' } }),
      permission(3, 'Bash', { command: 'ls' }, 'a1'),
      row('tool.post', 1, { tool: 'Bash', subagent: 'a1' }),
    ]);
    expect(s).toMatchObject({ activity: 'working', waiting: null });
  });

  it('la espera del agente principal no la termina un Evento de un Subagente', () => {
    const s = summary([prompt(6), permission(4), row('tool.post', 2, { tool: 'Read', subagent: 'a1' }), row('subagent.stopped', 1, { subagent: 'a1' })]);
    expect(s.waiting).toMatchObject({ since: at(4), subagent: null });
  });

  it('subagent.stopped del carril termina la espera del Subagente', () => {
    const s = summary([prompt(6), row('subagent.started', 5, { subagent: 'a1', payload: { agent_type: 'Plan' } }), ask(3, 'a1'), row('subagent.stopped', 1, { subagent: 'a1' })]);
    expect(s.waiting).toBeNull();
  });

  it('la inactividad termina con el siguiente Evento de cualquier carril', () => {
    const idle = notified(3, { notification_type: 'idle_prompt', message: 'Claude is waiting for your input' });
    expect(summary([prompt(5), idle, row('tool.pre', 1, { tool: 'Read', subagent: 'a1' })]).waiting).toBeNull();
    // Otro aviso no la termina ni la reinicia.
    const again = notified(1, { notification_type: 'idle_prompt', message: 'Claude is waiting for your input' });
    expect(summary([prompt(5), idle, again]).waiting).toMatchObject({ reason: 'idle', since: at(3) });
  });

  it('una Cerrada no está Esperando aunque su último Evento fuera una petición de permiso', () => {
    const s = summary([prompt(4), row('session.ended', 3), permission(2)]);
    expect(s).toMatchObject({ state: 'closed', activity: null, waiting: null });
  });

  it('una Huérfana no está Esperando', () => {
    const s = summary([
      { ...prompt(60), received_at: at(60) },
      { ...permission(45), received_at: at(45) },
    ]);
    expect(s).toMatchObject({ state: 'orphaned', activity: null, waiting: null });
  });

  it('una Sesión Esperando puede pasar de Activa a Inactiva sin dejar de esperar', () => {
    const active = summary([prompt(3), permission(2)]);
    const idle = summary([prompt(12), permission(10)]);
    expect(active).toMatchObject({ state: 'active', activity: 'waiting' });
    expect(idle).toMatchObject({ state: 'idle', activity: 'waiting' });
  });

  it('al retomar una Sesión Cerrada no hereda una espera anterior al cierre', () => {
    const s = summary([prompt(9), permission(8), row('session.ended', 7), row('session.started', 2), row('tool.pre', 1, { tool: 'Read' })]);
    expect(s).toMatchObject({ state: 'active', activity: 'working', waiting: null });
  });
});

describe('AC-91: espera de un Subagente', () => {
  const started = (m: number) => row('subagent.started', m, { subagent: 'a1', payload: { agent_type: 'code-reviewer' } });

  it('la espera identifica al Subagente con su id y su Tipo', () => {
    const s = summary([prompt(5), started(4), ask(1, 'a1')]);
    expect(s.waiting).toMatchObject({ reason: 'question', subagent: { id: 'a1', type: 'code-reviewer' } });
  });

  it('si espera el agente principal no lleva Subagente aunque haya otros en marcha', () => {
    const s = summary([prompt(5), started(4), permission(1)]);
    expect(s.running_subagents).toBe(1);
    expect(s.waiting?.subagent).toBeNull();
  });

  it('un Subagente de Tipo desconocido se identifica con el Tipo a null', () => {
    const s = summary([prompt(5), permission(1, 'Bash', { command: 'ls' }, 'a9')]);
    expect(s.waiting).toMatchObject({ subagent: { id: 'a9', type: null } });
  });

  it('un Subagente interno (solo subagent.stopped, sin lanzamiento) no aparece como quien espera', () => {
    // La espera del agente principal no se atribuye a un carril interno que se limita a pararse.
    const s = summary([prompt(5), row('subagent.stopped', 3, { subagent: 'internal' }), permission(1)]);
    expect(s.waiting).toMatchObject({ reason: 'permission', subagent: null });
  });
});
