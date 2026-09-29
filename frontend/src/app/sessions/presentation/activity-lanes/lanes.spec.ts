import { TestBed } from '@angular/core/testing';
import { observedEvent } from '../../../events/testing/event-fixtures';
import { sessionDetail } from '../../testing/session-fixtures';
import { ActivityLanes } from './activity-lanes';
import { buildLanes } from './lanes';

const at = (minute: number) => new Date(Date.UTC(2026, 8, 25, 10, minute));
const ev = (id: string, minute: number, overrides: Parameters<typeof observedEvent>[0] = {}) =>
  observedEvent({ id, occurredAt: at(minute), ...overrides });

const events = [
  ev('prompt', 0, { eventType: 'prompt.submitted', toolName: null }),
  ev('pre', 1),
  ev('post', 3, { eventType: 'tool.post' }),
  ev('sub-start', 4, { eventType: 'subagent.started', subagentId: 'agent-9a8b7c', toolName: null }),
  ev('sub-pre', 5, { subagentId: 'agent-9a8b7c' }),
  ev('anon', 6, { subagentId: 'agent-ffff0000' }),
  ev('blocked', 8, { eventType: 'tool.blocked' }),
  ev('end', 10, { eventType: 'turn.ended', toolName: null }),
];

describe('AC-19: buildLanes', () => {
  const { subagents } = sessionDetail();
  const turns = [{ index: 1, startedAt: at(0), endedAt: null, durationMs: 0, prompt: null, toolCount: 0 }];
  const view = buildLanes([...events].reverse(), turns, subagents, at(10));

  it('pinta el principal, un carril por Subagente y los Bloqueos al final', () => {
    expect(view.lanes.map((l) => l.label)).toStrictEqual(['Principal', '└ Explore', '└ agent-ff', 'Bloqueos']);
  });

  it('une tool.pre y tool.post del mismo carril en una barra; el inicio conserva su punto', () => {
    const main = view.lanes[0]!;
    expect(main.bars.map((b) => [b.from, b.to])).toStrictEqual([[10, 30]]);
    expect(main.marks.map((m) => m.id)).toStrictEqual(['prompt', 'pre', 'end']);
  });

  it('el prompt es un rombo, el Bloqueo una cruz y las posiciones van de 0 a 100', () => {
    expect(view.lanes[0]!.marks[0]).toMatchObject({ shape: 'diamond', at: 0 });
    expect(view.lanes[3]!.marks[0]).toMatchObject({ shape: 'cross', at: 80, type: 'tool.blocked' });
    expect(view.lanes[0]!.marks[2]!.at).toBe(100);
  });

  it('un Turno en curso llega hasta el final visible', () => {
    expect(view.turns).toStrictEqual([{ from: 0, to: 100, title: 'Turno 1' }]);
  });

  it('sin Bloqueos no hay carril de Bloqueos y sin Eventos no hay carriles', () => {
    const withoutBlocks = buildLanes(events.filter((e) => e.eventType !== 'tool.blocked'), [], [], at(10));
    expect(withoutBlocks.lanes.some((l) => l.kind === 'blocks')).toBe(false);
    expect(buildLanes([], [], [], at(10))).toStrictEqual({ lanes: [], turns: [], ticks: [] });
  });
});

describe('AC-19: ActivityLanes', () => {
  it('pinta un carril por agente con sus marcas', async () => {
    await TestBed.configureTestingModule({ imports: [ActivityLanes] }).compileComponents();
    const fixture = TestBed.createComponent(ActivityLanes);
    fixture.componentRef.setInput('events', events);
    fixture.componentRef.setInput('turns', []);
    fixture.componentRef.setInput('subagents', sessionDetail().subagents);
    fixture.componentRef.setInput('end', at(10));
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('[data-testid="lane"]')).toHaveLength(4);
    expect(el.querySelector('[data-testid="activity-lanes"]')?.getAttribute('role')).toBe('img');
  });
});
