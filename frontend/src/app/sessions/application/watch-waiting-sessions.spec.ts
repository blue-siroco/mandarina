import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AlertSound } from '../../budgets/application/alert-sound';
import { LiveEvents } from '../../events/application/live-events';
import { ObservedEvent } from '../../events/models/observed-event';
import { observedEvent } from '../../events/testing/event-fixtures';
import { SessionFilter, SessionList, SessionSummary, SessionWaiting } from '../models/session';
import { SessionSource } from '../ports/session-source';
import { sessionSummary } from '../testing/session-fixtures';
import { BOARD_REFRESH_MS } from './watch-session-board';
import {
  BASE_TITLE,
  INITIAL_WAITING,
  WAITING_FAVICON,
  WAITING_RESOUND_MS,
  WaitingState,
  WatchWaitingSessions,
  oldestWaiting,
} from './watch-waiting-sessions';

const at = (iso: string) => new Date(iso);
const list = (items: SessionSummary[]): SessionList => ({
  items,
  facets: { projects: [], directories: [] },
});

const waiting = (sessionId: string, since: string, overrides: Partial<SessionWaiting> = {}): SessionSummary =>
  sessionSummary({
    sessionId,
    activity: 'waiting',
    waiting: {
      since: at(since),
      reason: 'permission',
      tool: 'Bash',
      summary: 'npm run build',
      subagent: null,
      ...overrides,
    },
  });

describe('AC-95: oldestWaiting', () => {
  it('elige la Sesión que más tiempo lleva esperando, sin mirar otras Actividades', () => {
    const old = waiting('vieja', '2026-09-25T10:00:00Z');
    const items = [sessionSummary({ sessionId: 'trabaja' }), waiting('nueva', '2026-09-25T11:00:00Z'), old];
    expect(oldestWaiting(items)).toStrictEqual({ count: 2, oldest: old });
  });

  it('sin Sesiones Esperando no hay aviso', () => {
    expect(oldestWaiting([sessionSummary()])).toStrictEqual({ count: 0, oldest: null });
  });
});

describe('AC-95, AC-96: WatchWaitingSessions', () => {
  let live: Subject<ObservedEvent[]>;
  let calls: SessionFilter[];
  let respond: () => Observable<SessionList>;
  let states: WaitingState[];
  let play: ReturnType<typeof vi.fn>;
  let links: HTMLLinkElement[];
  let subscription: { unsubscribe(): void };

  function start() {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SessionSource,
          useValue: { list: (f: SessionFilter) => (calls.push(f), respond()) },
        },
        { provide: LiveEvents, useValue: { events$: live } },
        { provide: AlertSound, useValue: { play } },
      ],
    });
    subscription = TestBed.inject(WatchWaitingSessions).state$.subscribe((s) => states.push(s));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at('2026-09-25T12:00:00Z'));
    live = new Subject<ObservedEvent[]>();
    calls = [];
    states = [];
    play = vi.fn();
    respond = () => of(list([]));
    document.title = BASE_TITLE;
    links = ['image/svg+xml', 'image/x-icon'].map((type, i) => {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = type;
      link.href = i === 0 ? 'assets/images/logo.svg' : 'favicon.ico';
      document.head.append(link);
      return link;
    });
  });

  afterEach(() => {
    subscription.unsubscribe();
    links.forEach((l) => l.remove());
    vi.useRealTimers();
  });

  it('cuenta todas las Sesiones Esperando: pide sin filtros', async () => {
    respond = () =>
      of(list([waiting('a', '2026-09-25T11:00:00Z'), waiting('b', '2026-09-25T10:00:00Z'), sessionSummary({ sessionId: 'c' })]));
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls[0]).toStrictEqual({});
    expect(states.at(-1)).toMatchObject({
      loaded: true,
      failed: false,
      count: 2,
      oldest: { sessionId: 'b' },
    });
  });

  it('el estado inicial no avisa de nada', () => {
    start();
    expect(states[0]).toStrictEqual(INITIAL_WAITING);
  });

  it('refresca con el periodo del board y con los Eventos en vivo', async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
    expect(calls).toHaveLength(2);
    live.next([observedEvent({ eventType: 'permission.requested' })]);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(3);
  });

  it('el título lleva (N) mientras hay esperas y se restaura al terminar', async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.title).toBe('Mandarina');
    respond = () => of(list([waiting('a', '2026-09-25T11:00:00Z'), waiting('b', '2026-09-25T11:30:00Z')]));
    await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
    expect(document.title).toBe('(2) Mandarina');
    respond = () => of(list([]));
    await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
    expect(document.title).toBe('Mandarina');
  });

  it('el favicon pasa a la variante de aviso y se restaura', async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);
    const original = links.map((l) => l.getAttribute('href'));
    respond = () => of(list([waiting('a', '2026-09-25T11:00:00Z')]));
    await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
    expect(links.map((l) => l.getAttribute('href'))).toStrictEqual([WAITING_FAVICON, WAITING_FAVICON]);
    respond = () => of(list([]));
    await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
    expect(links.map((l) => l.getAttribute('href'))).toStrictEqual(original);
    expect(links.map((l) => l.type)).toStrictEqual(['image/svg+xml', 'image/x-icon']);
  });

  it('al dejar de observar restaura título y favicon', async () => {
    respond = () => of(list([waiting('a', '2026-09-25T11:00:00Z')]));
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.title).toBe('(1) Mandarina');
    subscription.unsubscribe();
    expect(document.title).toBe('Mandarina');
    expect(links[0]!.getAttribute('href')).toBe('assets/images/logo.svg');
  });

  it('si la API falla conserva el último valor y marca el fallo', async () => {
    respond = () => of(list([waiting('a', '2026-09-25T11:00:00Z')]));
    start();
    await vi.advanceTimersByTimeAsync(0);
    respond = () => throwError(() => new Error('500'));
    await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
    expect(states.at(-1)).toMatchObject({
      count: 1,
      oldest: { sessionId: 'a' },
      loaded: true,
      failed: true,
    });
    expect(document.title).toBe('(1) Mandarina');
    expect(play).not.toHaveBeenCalled();
  });

  describe('AC-96: sonido', () => {
    it('no suena por las Sesiones que ya esperaban en la primera carga', async () => {
      respond = () => of(list([waiting('a', '2026-09-25T11:00:00Z')]));
      start();
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS * 3);
      expect(play).not.toHaveBeenCalled();
    });

    it('suena una vez al pasar una Sesión a Esperando', async () => {
      start();
      await vi.advanceTimersByTimeAsync(0);
      respond = () => of(list([waiting('a', '2026-09-25T12:00:05Z')]));
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
      expect(play).toHaveBeenCalledExactlyOnceWith('waiting');
    });

    it('varias Sesiones en el mismo refresco suenan una sola vez', async () => {
      start();
      await vi.advanceTimersByTimeAsync(0);
      respond = () => of(list([waiting('a', '2026-09-25T12:00:05Z'), waiting('b', '2026-09-25T12:00:06Z')]));
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
      expect(play).toHaveBeenCalledTimes(1);
    });

    it('otra Sesión que se suma a las que ya esperaban vuelve a sonar pasado el plazo', async () => {
      start();
      await vi.advanceTimersByTimeAsync(0);
      respond = () => of(list([waiting('a', '2026-09-25T12:00:05Z')]));
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
      respond = () => of(list([waiting('a', '2026-09-25T12:00:05Z'), waiting('b', '2026-09-25T12:00:30Z')]));
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
      expect(play).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(WAITING_RESOUND_MS);
      expect(play).toHaveBeenCalledTimes(2);
    });

    it('una Sesión que sigue esperando vuelve a sonar cada WAITING_RESOUND_MS, y solo si sigue', async () => {
      start();
      await vi.advanceTimersByTimeAsync(0);
      respond = () => of(list([waiting('a', '2026-09-25T12:00:05Z')]));
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
      expect(play).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(WAITING_RESOUND_MS);
      expect(play).toHaveBeenCalledTimes(2);
      respond = () => of(list([]));
      await vi.advanceTimersByTimeAsync(WAITING_RESOUND_MS * 2);
      expect(play).toHaveBeenCalledTimes(2);
    });

    it('si deja de esperar y vuelve antes del plazo, la nueva transición no suena', async () => {
      start();
      await vi.advanceTimersByTimeAsync(0);
      respond = () => of(list([waiting('a', '2026-09-25T12:00:05Z')]));
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
      respond = () => of(list([]));
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
      respond = () => of(list([waiting('a', '2026-09-25T12:00:40Z')]));
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
      expect(play).toHaveBeenCalledTimes(1);
    });

    it('con una Sesión que cambia de espera (mismo id, otro inicio) suena como transición', async () => {
      respond = () => of(list([waiting('a', '2026-09-25T11:00:00Z')]));
      start();
      await vi.advanceTimersByTimeAsync(0);
      respond = () => of(list([waiting('a', '2026-09-25T12:00:05Z')]));
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MS);
      expect(play).toHaveBeenCalledTimes(1);
    });
  });
});
