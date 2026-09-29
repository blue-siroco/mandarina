import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of } from 'rxjs';
import { LiveEvents } from '../../events/application/live-events';
import { EventQuery, ObservedEvent } from '../../events/models/observed-event';
import { EventFeed } from '../../events/ports/event-feed';
import { observedEvent } from '../../events/testing/event-fixtures';
import { SessionDetail } from '../models/session';
import { SessionSource } from '../ports/session-source';
import { SESSION_ID, sessionDetail } from '../testing/session-fixtures';
import { LIVE_THROTTLE_MS } from './watch-session-board';
import { DetailState, INITIAL_DETAIL, SESSION_EVENTS_LIMIT, WatchSessionDetail, reduceDetail } from './watch-session-detail';

describe('AC-19: reduceDetail', () => {
  it('una Sesión que no existe queda como no encontrada y sin Eventos', () => {
    const withData = reduceDetail(INITIAL_DETAIL, { ok: true, detail: sessionDetail(), events: [observedEvent()] });
    expect(reduceDetail(withData, { ok: true, detail: null, events: [observedEvent()] })).toStrictEqual({
      detail: null,
      events: [],
      loaded: true,
      notFound: true,
      failed: false,
    });
  });

  it('un fallo conserva los últimos datos', () => {
    const withData = reduceDetail(INITIAL_DETAIL, { ok: true, detail: sessionDetail(), events: [] });
    expect(reduceDetail(withData, { ok: false })).toMatchObject({ detail: sessionDetail(), failed: true });
  });
});

describe('AC-19: WatchSessionDetail', () => {
  let live: Subject<ObservedEvent[]>;
  let detailCalls: string[];
  let queries: EventQuery[];
  let states: DetailState[];

  beforeEach(() => {
    vi.useFakeTimers();
    live = new Subject<ObservedEvent[]>();
    detailCalls = [];
    queries = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SessionSource,
          useValue: { detail: (id: string): Observable<SessionDetail | null> => (detailCalls.push(id), of(sessionDetail())) },
        },
        { provide: EventFeed, useValue: { search: (q: EventQuery) => (queries.push(q), of([observedEvent()])) } },
        { provide: LiveEvents, useValue: { events$: live } },
      ],
    });
    states = [];
    TestBed.inject(WatchSessionDetail)
      .execute(SESSION_ID)
      .subscribe((s) => states.push(s));
  });

  afterEach(() => vi.useRealTimers());

  it('pide el detalle y los Eventos de la Sesión', async () => {
    await vi.advanceTimersByTimeAsync(0);
    expect(detailCalls).toStrictEqual([SESSION_ID]);
    expect(queries).toStrictEqual([{ sessionId: SESSION_ID, limit: SESSION_EVENTS_LIMIT }]);
    expect(states.at(-1)).toMatchObject({ loaded: true, notFound: false, events: [observedEvent()] });
  });

  it('se refresca con Eventos de su Sesión, no con los de otras', async () => {
    await vi.advanceTimersByTimeAsync(0);
    live.next([observedEvent({ sessionId: 'otra' })]);
    await vi.advanceTimersByTimeAsync(LIVE_THROTTLE_MS);
    expect(detailCalls).toHaveLength(1);

    live.next([observedEvent({ sessionId: SESSION_ID })]);
    await vi.advanceTimersByTimeAsync(0);
    expect(detailCalls).toHaveLength(2);
  });
});
