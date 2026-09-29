import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { LiveEvents } from '../../events/application/live-events';
import { ObservedEvent } from '../../events/models/observed-event';
import { observedEvent } from '../../events/testing/event-fixtures';
import { SessionFilter, SessionList, SessionSummary } from '../models/session';
import { SessionSource } from '../ports/session-source';
import { sessionSummary } from '../testing/session-fixtures';
import {
  BOARD_REFRESH_MS,
  BoardState,
  INITIAL_BOARD,
  LIVE_THROTTLE_MS,
  WatchSessionBoard,
  countStates,
  groupByProject,
  reduceBoard,
} from './watch-session-board';

const at = (iso: string) => new Date(iso);
const list = (items = [sessionSummary()]): SessionList => ({ items, facets: { projects: [], directories: [] } });

describe('AC-16: groupByProject', () => {
  const session = (sessionId: string, project: string, state: SessionSummary['state'], started: string, lastActivity: string) =>
    sessionSummary({ sessionId, project, state, startedAt: at(started), lastActivityAt: at(lastActivity) });

  it('agrupa por Proyecto en orden alfabético y separa las Cerradas', () => {
    const groups = groupByProject([
      session('a', 'mandarina', 'active', '2026-09-25T09:00:00Z', '2026-09-25T10:00:00Z'),
      session('b', 'Lucia', 'idle', '2026-09-25T08:00:00Z', '2026-09-25T11:00:00Z'),
      session('c', 'mandarina', 'closed', '2026-09-25T07:00:00Z', '2026-09-25T09:00:00Z'),
      session('d', 'api-pagos', 'active', '2026-09-25T06:00:00Z', '2026-09-25T06:30:00Z'),
    ]);

    expect(groups.map((g) => g.project)).toStrictEqual(['api-pagos', 'Lucia', 'mandarina']);
    const mandarina = groups[2]!;
    expect(mandarina.open.map((s) => s.sessionId)).toStrictEqual(['a']);
    expect(mandarina.closed.map((s) => s.sessionId)).toStrictEqual(['c']);
    expect(mandarina.activeCount).toBe(1);
  });

  it('dentro de un Proyecto ordena por inicio, sin mirar Estado ni actividad', () => {
    const [group] = groupByProject([
      session('vieja-activa', 'demo', 'active', '2026-09-25T08:00:00Z', '2026-09-25T12:00:00Z'),
      session('nueva-inactiva', 'demo', 'idle', '2026-09-25T11:00:00Z', '2026-09-25T11:05:00Z'),
      session('media-huerfana', 'demo', 'orphaned', '2026-09-25T10:00:00Z', '2026-09-25T10:01:00Z'),
    ]);
    expect(group!.open.map((s) => s.sessionId)).toStrictEqual(['nueva-inactiva', 'media-huerfana', 'vieja-activa']);
  });

  it('un Evento nuevo en otro Proyecto no cambia el orden de los grupos', () => {
    const before = [
      session('a', 'demo', 'active', '2026-09-25T09:00:00Z', '2026-09-25T10:00:00Z'),
      session('b', 'lucia', 'active', '2026-09-25T09:00:00Z', '2026-09-25T10:00:00Z'),
    ];
    const after = [before[0]!, { ...before[1]!, lastActivityAt: at('2026-09-25T12:00:00Z') }];
    expect(groupByProject(after).map((g) => g.project)).toStrictEqual(groupByProject(before).map((g) => g.project));
  });

  it('cuenta las Sesiones por Estado', () => {
    const counts = countStates([
      sessionSummary({ state: 'active' }),
      sessionSummary({ state: 'orphaned' }),
      sessionSummary({ state: 'orphaned' }),
    ]);
    expect(counts).toStrictEqual({ active: 1, idle: 0, orphaned: 2, closed: 0 });
  });
});

describe('AC-16: reduceBoard', () => {
  it('ante un fallo conserva la última lista', () => {
    const loaded = reduceBoard(INITIAL_BOARD, { ok: true, list: list() });
    expect(reduceBoard(loaded, { ok: false })).toStrictEqual({ list: list(), loaded: true, failed: true });
  });
});

describe('AC-16: WatchSessionBoard', () => {
  let live: Subject<ObservedEvent[]>;
  let calls: SessionFilter[];
  let respond: () => Observable<SessionList>;
  let states: BoardState[];

  function start(windowMs?: number) {
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionSource, useValue: { list: (f: SessionFilter) => (calls.push(f), respond()) } },
        { provide: LiveEvents, useValue: { events$: live } },
      ],
    });
    states = [];
    TestBed.inject(WatchSessionBoard)
      .execute({ windowMs, directory: 'C:\\x' })
      .subscribe((s) => states.push(s));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at('2026-09-25T12:00:00Z'));
    live = new Subject<ObservedEvent[]>();
    calls = [];
    respond = () => of(list());
  });

  afterEach(() => vi.useRealTimers());

  it('pide al empezar y vuelve a pedir cada intervalo, con since recalculado', async () => {
    start(60 * 60_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toStrictEqual({ since: at('2026-09-25T11:00:00Z'), states: undefined, directory: 'C:\\x' });
    expect(states.at(-1)).toMatchObject({ loaded: true, failed: false });

    await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.since).toStrictEqual(new Date(at('2026-09-25T11:00:00Z').getTime() + BOARD_REFRESH_MS));
  });

  it('sin ventana pide todas las Sesiones', async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls[0]!.since).toBeUndefined();
  });

  it('una ráfaga de Eventos en vivo provoca como mucho dos recargas por segundo', async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 10; i++) live.next([observedEvent({ id: String(i) })]);
    await vi.advanceTimersByTimeAsync(LIVE_THROTTLE_MS);
    expect(calls).toHaveLength(3);
  });

  it('un fallo avisa y conserva las Sesiones', async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);
    respond = () => throwError(() => new Error('500'));
    await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
    expect(states.at(-1)).toStrictEqual({ list: list(), loaded: true, failed: true });
  });
});
