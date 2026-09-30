import { ExportEvents } from '../src/application/export-events.js';
import type { EventFilter, EventRepository, EventWindow } from '../src/application/ports.js';
import type { StoredEvent } from '../src/domain/event.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');

function stored(n: number, payload: Record<string, unknown> = {}): StoredEvent {
  return {
    schema_version: 1,
    id: `e${n}`,
    harness: 'claude-code',
    project: 'demo',
    directory: '/code/demo',
    session_id: 's1',
    subagent_id: null,
    event_type: 'tool.pre',
    native_event_type: 'PreToolUse',
    tool_name: 'Bash',
    occurred_at: NOW.toISOString(),
    received_at: NOW.toISOString(),
    transcript_path: null,
    payload,
    block: null,
  };
}

/** Repositorio falso: cuenta cuántos Eventos se han leído, para comprobar el streaming. */
function fakeRepository(total: number, options: { payload?: Record<string, unknown> } = {}) {
  const spy = { read: 0, counted: 0, windowed: 0, capSeen: 0 };
  const repository = {
    countEvents: (_filter: EventFilter) => {
      spy.counted += 1;
      return total;
    },
    eventWindow: (_filter: EventFilter, cap: number): EventWindow => {
      spy.windowed += 1;
      spy.capSeen = cap;
      const exported = Math.min(total, cap);
      return {
        total,
        events: (function* () {
          // Los más recientes: los últimos `exported`, en orden ascendente.
          for (let n = total - exported + 1; n <= total; n++) {
            spy.read += 1;
            yield stored(n, options.payload);
          }
        })(),
      };
    },
  } as unknown as EventRepository;
  return { repository, spy };
}

const clock = { now: () => NOW };
const parse = (lines: Iterable<string>) => [...lines].map((line) => JSON.parse(line));

describe('AC-144: la Descarga de Eventos es una cabecera y un Evento por línea', () => {
  it('la primera línea es la cabecera con los filtros y las demás son Eventos ascendentes', () => {
    const { repository } = fakeRepository(3);
    const filter: EventFilter = { project: 'demo', sessionId: 's1', eventTypes: ['tool.pre'], toolNames: ['Bash'], since: '2026-09-25T00:00:00.000Z' };
    const [head, ...rest] = parse(new ExportEvents(repository, clock).lines(filter, false));

    expect(head).toStrictEqual({
      export: {
        kind: 'events',
        generated_at: NOW.toISOString(),
        include_content: false,
        filters: { project: 'demo', session_id: 's1', event_type: ['tool.pre'], tool: ['Bash'], since: '2026-09-25T00:00:00.000Z' },
        total: 3,
        exported: 3,
        truncated: false,
        omitted: 0,
      },
    });
    expect(rest.map((e) => e.id)).toStrictEqual(['e1', 'e2', 'e3']);
  });

  it('sin coincidencias solo sale la cabecera con total 0', () => {
    const { repository } = fakeRepository(0);
    const lines = [...new ExportEvents(repository, clock).lines({}, false)];
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).export).toMatchObject({ total: 0, exported: 0, truncated: false, omitted: 0, filters: {} });
  });

  it('cada línea termina en salto de línea', () => {
    const { repository } = fakeRepository(1);
    for (const line of new ExportEvents(repository, clock).lines({}, false)) expect(line.endsWith('\n')).toBe(true);
  });

  it('va en streaming: la cabecera sale sin haber leído ningún Evento y cada Evento se lee al pedirlo', () => {
    const { repository, spy } = fakeRepository(1000);
    const iterator = new ExportEvents(repository, clock).lines({}, false)[Symbol.iterator]();

    iterator.next(); // cabecera
    expect(spy.read).toBe(0);
    iterator.next(); // primer Evento
    expect(spy.read).toBe(1);
  });
});

describe('AC-145: el tope y el truncado', () => {
  it('con el tope superado salen los más recientes y la cabecera lo dice', () => {
    const { repository, spy } = fakeRepository(10);
    const [head, ...rest] = parse(new ExportEvents(repository, clock, 4).lines({}, false));

    expect(spy.capSeen).toBe(4);
    expect(head.export).toMatchObject({ total: 10, exported: 4, truncated: true, omitted: 6 });
    expect(rest.map((e) => e.id)).toStrictEqual(['e7', 'e8', 'e9', 'e10']);
  });

  it('la vista previa da recuento y campos sin leer los Eventos', () => {
    const { repository, spy } = fakeRepository(10);
    const preview = new ExportEvents(repository, clock, 4).preview({}, true);

    expect(preview).toMatchObject({ total: 10, exported: 4, truncated: true, omitted: 6 });
    expect(preview.fields).toContain('payload');
    expect(spy.read).toBe(0);
    expect(spy.windowed).toBe(0);
  });
});

describe('AC-143: contenido opt-in y enmascarado', () => {
  const secret = { tool_input: { command: 'echo GITHUB_TOKEN=ghp_abcdefghijklmnopqrstu' } };

  it('sin content los Eventos no llevan payload', () => {
    const { repository } = fakeRepository(1, { payload: secret });
    const [head, event] = parse(new ExportEvents(repository, clock).lines({}, false));
    expect(head.export.include_content).toBe(false);
    expect('payload' in event).toBe(false);
  });

  it('con content un secreto presente en un Evento guardado sale como marcador, nunca en claro', () => {
    const { repository } = fakeRepository(1, { payload: secret });
    const lines = [...new ExportEvents(repository, clock).lines({}, true)];
    expect(lines.join('')).not.toContain('ghp_');
    const [head, event] = lines.map((l) => JSON.parse(l));
    expect(head.export.include_content).toBe(true);
    expect(event.payload.tool_input.command).toBe('echo GITHUB_TOKEN=[REDACTED_API_KEY]');
  });
});
