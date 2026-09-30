import { TestBed } from '@angular/core/testing';
import { Observable, Subject, throwError } from 'rxjs';
import { EventQuery, ObservedEvent } from '../models/observed-event';
import { EventFeed } from '../ports/event-feed';
import { observedEvent } from '../testing/event-fixtures';
import { LiveEvents } from './live-events';
import {
  INITIAL_STATE,
  RECENT_EVENTS_LIMIT,
  RecentEventsState,
  WatchRecentEvents,
  mergeEvents,
  reduce,
} from './watch-recent-events';

const at = (id: string, ms: number) => observedEvent({ id, receivedAt: new Date(ms) });
const ids = (events: ObservedEvent[]) => events.map((e) => e.id);

describe('AC-09: mergeEvents', () => {
  it('ordena del más reciente al más antiguo', () => {
    expect(ids(mergeEvents([at('a', 1)], [at('c', 3), at('b', 2)], 10))).toStrictEqual(['c', 'b', 'a']);
  });

  it('no duplica un Evento que llega por dos vías', () => {
    expect(ids(mergeEvents([at('a', 1)], [at('a', 1), at('b', 2)], 10))).toStrictEqual(['b', 'a']);
  });

  it('recorta al límite conservando los más recientes', () => {
    expect(ids(mergeEvents([], [at('a', 1), at('b', 2), at('c', 3)], 2))).toStrictEqual(['c', 'b']);
  });
});

describe('AC-09: reduce', () => {
  it('marca cargado al llegar el historial', () => {
    const state = reduce(INITIAL_STATE, { kind: 'history', events: [at('a', 1)] });
    expect(state).toStrictEqual({ ...INITIAL_STATE, loaded: true, events: [at('a', 1)] });
  });

  it('marca el fallo del historial sin perder los Eventos en vivo', () => {
    const withLive = reduce(INITIAL_STATE, { kind: 'live', events: [at('a', 1)] });
    const state = reduce(withLive, { kind: 'history', events: null });
    expect(state).toStrictEqual({ loaded: true, historyFailed: true, events: [at('a', 1)] });
  });

  it('los Eventos en vivo no marcan el historial como cargado', () => {
    expect(reduce(INITIAL_STATE, { kind: 'live', events: [at('a', 1)] }).loaded).toBe(false);
  });
});

class FakeFeed extends EventFeed {
  history = new Subject<ObservedEvent[]>();
  failHistory = false;
  queries: EventQuery[] = [];
  search(query: EventQuery): Observable<ObservedEvent[]> {
    this.queries.push(query);
    return this.failHistory ? throwError(() => new Error('500')) : this.history;
  }
  live(): Observable<never> {
    throw new Error('Los casos de uso escuchan LiveEvents, no el feed');
  }
}

describe('AC-09: WatchRecentEvents', () => {
  let feed: FakeFeed;
  let live: Subject<ObservedEvent[]>;
  let states: RecentEventsState[];

  function start() {
    TestBed.configureTestingModule({
      providers: [
        { provide: EventFeed, useValue: feed },
        { provide: LiveEvents, useValue: { events$: live } },
      ],
    });
    states = [];
    TestBed.inject(WatchRecentEvents)
      .execute()
      .subscribe((s) => states.push(s));
  }

  const last = () => states[states.length - 1]!;

  beforeEach(() => {
    feed = new FakeFeed();
    live = new Subject<ObservedEvent[]>();
  });

  it('pide los Eventos más recientes hasta el límite', () => {
    start();
    expect(feed.queries).toStrictEqual([{ limit: RECENT_EVENTS_LIMIT }]);
  });

  it('emite el estado inicial, luego el historial y después los Eventos en vivo arriba', () => {
    start();
    expect(last()).toStrictEqual(INITIAL_STATE);

    feed.history.next([at('a', 1)]);
    live.next([at('b', 2)]);

    expect(last().loaded).toBe(true);
    expect(ids(last().events)).toStrictEqual(['b', 'a']);
  });

  it('si el historial falla, sigue mostrando los Eventos en vivo', () => {
    feed.failHistory = true;
    start();
    live.next([at('a', 1)]);

    expect(last().historyFailed).toBe(true);
    expect(ids(last().events)).toStrictEqual(['a']);
  });
});

describe('AC-110, AC-111: WatchRecentEvents con filtros', () => {
  let feed: FakeFeed;
  let live: Subject<ObservedEvent[]>;
  let states: RecentEventsState[];

  function start(filters: Parameters<WatchRecentEvents['execute']>[0]) {
    TestBed.configureTestingModule({
      providers: [
        { provide: EventFeed, useValue: feed },
        { provide: LiveEvents, useValue: { events$: live } },
      ],
    });
    states = [];
    TestBed.inject(WatchRecentEvents)
      .execute(filters)
      .subscribe((s) => states.push(s));
  }

  const from = (id: string, project: string, sessionId: string) => observedEvent({ id, project, sessionId, receivedAt: new Date(Number(id)) });

  beforeEach(() => {
    feed = new FakeFeed();
    live = new Subject<ObservedEvent[]>();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T10:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('AC-110: pide el historial con project, session_id y since = ahora − periodo', () => {
    start({ project: 'mandarina', sessionId: 's-1', windowMs: 3_600_000 });
    expect(feed.queries).toStrictEqual([
      { limit: RECENT_EVENTS_LIMIT, project: 'mandarina', sessionId: 's-1', since: new Date('2026-09-30T09:00:00.000Z') },
    ]);
  });

  it('AC-110: sin filtros no envía ninguno', () => {
    start({});
    expect(feed.queries).toStrictEqual([{ limit: RECENT_EVENTS_LIMIT }]);
  });

  it('AC-111: los Eventos en vivo de otro Proyecto o Sesión se descartan', () => {
    start({ project: 'mandarina', sessionId: 's-1' });
    feed.history.next([]);
    live.next([from('1', 'mandarina', 's-1')]);
    live.next([from('2', 'otro', 's-1')]);
    live.next([from('3', 'mandarina', 's-2')]);
    live.next([from('4', 'mandarina', 's-1'), from('5', 'otro', 's-9')]);
    expect(ids(states.at(-1)!.events)).toStrictEqual(['4', '1']);
  });

  it('AC-111: con solo Proyecto acepta cualquier Sesión de ese Proyecto', () => {
    start({ project: 'mandarina' });
    live.next([from('1', 'mandarina', 's-1'), from('2', 'mandarina', 's-2'), from('3', 'lucia', 's-3')]);
    expect(ids(states.at(-1)!.events)).toStrictEqual(['2', '1']);
  });
});
