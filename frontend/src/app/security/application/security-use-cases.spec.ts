import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { LiveEvents } from '../../events/application/live-events';
import { observedEvent } from '../../events/testing/event-fixtures';
import { ObservedEvent } from '../../events/models/observed-event';
import { InjectionFilter, InjectionWarningList } from '../models/security';
import { SecuritySource } from '../ports/security-source';
import { injectionWarningList, maskingStats, stubSecuritySource } from '../testing/security-fixtures';
import { DismissInjectionWarning } from './dismiss-injection-warning';
import { INITIAL_MASKING, MASKING_REFRESH_MS, MaskingState, WatchMaskingStats, reduceMasking } from './watch-masking-stats';
import {
  INITIAL_WARNINGS,
  WARNINGS_REFRESH_DEBOUNCE_MS,
  WarningsState,
  WatchInjectionWarnings,
  reduceWarnings,
} from './watch-injection-warnings';

const now = new Date('2026-09-25T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('AC-66: reduceWarnings', () => {
  it('guarda la lista y los valores de los filtros, y limpia el fallo', () => {
    const list = injectionWarningList();
    expect(reduceWarnings({ ...INITIAL_WARNINGS, failed: true }, { ok: true, list })).toStrictEqual({
      items: list.items,
      projects: list.projects,
      patterns: list.patterns,
      loaded: true,
      failed: false,
    });
  });

  it('ante un fallo conserva lo último que se sabía', () => {
    const list = injectionWarningList();
    const before = reduceWarnings(INITIAL_WARNINGS, { ok: true, list });
    expect(reduceWarnings(before, { ok: false })).toStrictEqual({ ...before, failed: true });
  });
});

describe('AC-66: WatchInjectionWarnings', () => {
  let live: Subject<ObservedEvent[]>;
  let fetch: ReturnType<typeof vi.fn<(filter: InjectionFilter) => Observable<InjectionWarningList>>>;
  let states: WarningsState[];

  function start(query: Parameters<WatchInjectionWarnings['execute']>[0], refresh$?: Subject<void>) {
    TestBed.configureTestingModule({
      providers: [
        { provide: SecuritySource, useValue: { warnings: fetch } },
        { provide: LiveEvents, useValue: { events$: live } },
      ],
    });
    states = [];
    return TestBed.inject(WatchInjectionWarnings)
      .execute(query, refresh$)
      .subscribe((s) => states.push(s));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    live = new Subject<ObservedEvent[]>();
    fetch = vi.fn<(filter: InjectionFilter) => Observable<InjectionWarningList>>().mockReturnValue(of(injectionWarningList()));
  });

  afterEach(() => vi.useRealTimers());

  it('pide la ventana hacia atrás desde ahora con los filtros', () => {
    start({ windowMs: 7 * DAY, severities: ['high'], pattern: 'fake-turn', project: 'demo', sessionId: 's1', dismissed: 'all' });
    expect(fetch).toHaveBeenCalledWith({
      since: new Date(now.getTime() - 7 * DAY),
      severities: ['high'],
      pattern: 'fake-turn',
      project: 'demo',
      sessionId: 's1',
      dismissed: 'all',
    });
    expect(states.at(-1)).toMatchObject({ loaded: true, failed: false });
    expect(states.at(-1)!.items).toHaveLength(3);
  });

  it('sin periodo pide desde el origen de los tiempos', () => {
    start({});
    expect(fetch).toHaveBeenCalledWith({ since: new Date(0) });
  });

  it('vuelve a pedirlos con un tool.post y agrupa las ráfagas; otros Eventos no', async () => {
    start({ windowMs: DAY });
    live.next([observedEvent({ eventType: 'tool.pre' })]);
    await vi.advanceTimersByTimeAsync(WARNINGS_REFRESH_DEBOUNCE_MS);
    expect(fetch).toHaveBeenCalledTimes(1);

    live.next([observedEvent({ eventType: 'tool.post' })]);
    live.next([observedEvent({ eventType: 'tool.post' }), observedEvent({ eventType: 'turn.ended' })]);
    await vi.advanceTimersByTimeAsync(WARNINGS_REFRESH_DEBOUNCE_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('vuelve a pedirlos cuando se lo piden, por ejemplo tras descartar uno', () => {
    const refresh$ = new Subject<void>();
    start({}, refresh$);
    refresh$.next();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('un fallo se marca sin perder los avisos que ya había', async () => {
    start({ windowMs: DAY });
    fetch.mockReturnValue(throwError(() => new Error('caído')));
    live.next([observedEvent({ eventType: 'tool.post' })]);
    await vi.advanceTimersByTimeAsync(WARNINGS_REFRESH_DEBOUNCE_MS);
    expect(states.at(-1)).toMatchObject({ loaded: true, failed: true });
    expect(states.at(-1)!.items).toHaveLength(3);
  });

  it('empieza sin cargar', () => {
    start({});
    expect(states[0]).toStrictEqual(INITIAL_WARNINGS);
  });
});

describe('AC-64, AC-66: DismissInjectionWarning', () => {
  async function run(overrides: Parameters<typeof stubSecuritySource>[0], dismissed: boolean) {
    const stub = stubSecuritySource(overrides);
    TestBed.configureTestingModule({ providers: [stub.provider] });
    let outcome: string | undefined;
    TestBed.inject(DismissInjectionWarning)
      .execute('ev1:fake-turn', dismissed)
      .subscribe((o) => (outcome = o));
    return { outcome, calls: stub.calls };
  }

  it('descarta con PUT y restaura con DELETE', async () => {
    expect(await run({}, true)).toStrictEqual({ outcome: 'ok', calls: { warnings: [], dismiss: ['ev1:fake-turn'], restore: [], masking: [] } });
    TestBed.resetTestingModule();
    expect(await run({}, false)).toStrictEqual({ outcome: 'ok', calls: { warnings: [], dismiss: [], restore: ['ev1:fake-turn'], masking: [] } });
  });

  it('si falla devuelve failed en lugar de lanzar', async () => {
    expect((await run({ dismiss: () => throwError(() => new Error('500')) }, true)).outcome).toBe('failed');
    TestBed.resetTestingModule();
    expect((await run({ restore: () => throwError(() => new Error('500')) }, false)).outcome).toBe('failed');
  });
});

describe('AC-67: WatchMaskingStats', () => {
  let states: MaskingState[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    states = [];
  });

  afterEach(() => vi.useRealTimers());

  function start(overrides: Parameters<typeof stubSecuritySource>[0] = {}, windowMs?: number) {
    const stub = stubSecuritySource(overrides);
    TestBed.configureTestingModule({ providers: [stub.provider] });
    TestBed.inject(WatchMaskingStats)
      .execute(windowMs)
      .subscribe((s) => states.push(s));
    return stub.calls;
  }

  it('pide las estadísticas del periodo nada más suscribirse y cada 30 s', async () => {
    const calls = start({}, DAY);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.masking).toStrictEqual([new Date(now.getTime() - DAY)]);
    expect(states.at(-1)).toStrictEqual({ stats: maskingStats(), loaded: true, failed: false });
    await vi.advanceTimersByTimeAsync(MASKING_REFRESH_MS);
    expect(calls.masking).toHaveLength(2);
  });

  it('sin periodo pide todo el histórico', async () => {
    const calls = start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.masking).toStrictEqual([new Date(0)]);
  });

  it('un fallo se marca sin perder las últimas cifras', async () => {
    let fail = false;
    start({ maskingStats: () => (fail ? throwError(() => new Error('caído')) : of(maskingStats())) });
    await vi.advanceTimersByTimeAsync(0);
    fail = true;
    await vi.advanceTimersByTimeAsync(MASKING_REFRESH_MS);
    expect(states.at(-1)).toStrictEqual({ stats: maskingStats(), loaded: true, failed: true });
  });

  it('reduceMasking guarda las cifras nuevas y limpia el fallo', () => {
    const stats = maskingStats();
    expect(reduceMasking({ ...INITIAL_MASKING, failed: true }, { ok: true, stats })).toStrictEqual({ stats, loaded: true, failed: false });
  });
});
