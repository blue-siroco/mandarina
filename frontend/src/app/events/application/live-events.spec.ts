import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { LiveConnection, LiveSignal, ObservedEvent } from '../models/observed-event';
import { EventFeed } from '../ports/event-feed';
import { observedEvent } from '../testing/event-fixtures';
import { LiveEvents } from './live-events';

describe('AC-16: LiveEvents', () => {
  let signals: Subject<LiveSignal>;
  let opened: number;
  let live: LiveEvents;

  beforeEach(() => {
    signals = new Subject<LiveSignal>();
    opened = 0;
    const feed = {
      search: () => signals,
      live: () => {
        opened += 1;
        return signals;
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: EventFeed, useValue: feed }] });
    live = TestBed.inject(LiveEvents);
  });

  it('comparte un único socket entre todos los suscriptores', () => {
    live.events$.subscribe();
    live.events$.subscribe();
    live.connection$.subscribe();
    expect(opened).toBe(1);
  });

  it('emite los Eventos en arrays y descarta las señales de conexión', () => {
    const received: ObservedEvent[][] = [];
    live.events$.subscribe((events) => received.push(events));

    signals.next({ kind: 'connection', connection: 'live' });
    signals.next({ kind: 'event', event: observedEvent({ id: 'a' }) });

    expect(received.map((batch) => batch.map((e) => e.id))).toStrictEqual([['a']]);
  });

  it('AC-81: budgetChanges$ emite los cambios de estado y los Eventos no los ven', () => {
    const changes: string[] = [];
    const events: ObservedEvent[][] = [];
    live.budgetChanges$.subscribe((c) => changes.push(c.budgetId + ':' + c.state));
    live.events$.subscribe((e) => events.push(e));

    signals.next({
      kind: 'budget',
      change: { budgetId: 'b1', scope: 'global_day', project: null, sessionId: null, action: 'stop', state: 'near', previousState: 'within', spentUsd: 4, limitUsd: 5 },
    });
    signals.next({ kind: 'event', event: observedEvent({ id: 'a' }) });

    expect(changes).toStrictEqual(['b1:near']);
    expect(events).toHaveLength(1);
    expect(opened).toBe(1);
  });

  it('empieza en conectando, no repite estados y recuerda el último para quien llega tarde', () => {
    const early: LiveConnection[] = [];
    live.connection$.subscribe((c) => early.push(c));

    signals.next({ kind: 'connection', connection: 'connecting' });
    signals.next({ kind: 'connection', connection: 'live' });
    signals.next({ kind: 'connection', connection: 'live' });

    const late: LiveConnection[] = [];
    live.connection$.subscribe((c) => late.push(c));

    expect(early).toStrictEqual(['connecting', 'live']);
    expect(late).toStrictEqual(['live']);
  });
});
