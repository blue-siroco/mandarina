import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { UsageMetrics, UsageQuery } from '../models/usage-metrics';
import { UsageMetricsSource } from '../ports/usage-metrics-source';
import { usageMetrics } from '../testing/usage-fixtures';
import {
  INITIAL_USAGE_STATE,
  USAGE_REFRESH_MS,
  UsageState,
  WatchUsageMetrics,
  reduceUsage,
  usageWindowStart,
} from './watch-usage-metrics';

const HOUR = 60 * 60 * 1000;

describe('AC-13: usageWindowStart', () => {
  it('resta el periodo al momento actual', () => {
    const now = new Date(2026, 8, 25, 18, 42, 7);
    expect(usageWindowStart(7 * 24 * HOUR, now)).toStrictEqual(new Date(2026, 8, 18, 18, 42, 7));
  });

  it('sin periodo ("Todo") empieza en el origen de los tiempos', () => {
    expect(usageWindowStart(undefined, new Date(2026, 8, 25))).toStrictEqual(new Date(0));
  });
});

describe('AC-13: reduceUsage', () => {
  it('guarda las cifras nuevas y limpia el fallo', () => {
    const metrics = usageMetrics();
    expect(reduceUsage({ ...INITIAL_USAGE_STATE, failed: true }, { ok: true, metrics })).toStrictEqual({
      metrics,
      loaded: true,
      failed: false,
    });
  });

  it('ante un fallo conserva las últimas cifras conocidas', () => {
    const metrics = usageMetrics();
    expect(reduceUsage({ metrics, loaded: true, failed: false }, { ok: false })).toStrictEqual({
      metrics,
      loaded: true,
      failed: true,
    });
  });
});

describe('AC-13: WatchUsageMetrics', () => {
  let fetch: ReturnType<typeof vi.fn<(since: Date, query?: UsageQuery) => Observable<UsageMetrics>>>;

  function execute(windowMs?: number, query: UsageQuery = {}): UsageState[] {
    const states: UsageState[] = [];
    TestBed.configureTestingModule({ providers: [{ provide: UsageMetricsSource, useValue: { fetch } }] });
    TestBed.inject(WatchUsageMetrics)
      .execute(windowMs, query)
      .subscribe((s) => states.push(s));
    return states;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 25, 10, 30));
    fetch = vi.fn<(since: Date, query?: UsageQuery) => Observable<UsageMetrics>>();
  });

  afterEach(() => vi.useRealTimers());

  it('pide las del periodo al empezar y vuelve a pedirlas cada intervalo', async () => {
    fetch.mockReturnValue(of(usageMetrics()));
    const states = execute(24 * HOUR);

    expect(states[0]).toStrictEqual(INITIAL_USAGE_STATE);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledWith(new Date(2026, 8, 24, 10, 30), {});
    expect(states.at(-1)).toMatchObject({ loaded: true, failed: false });

    await vi.advanceTimersByTimeAsync(USAGE_REFRESH_MS * 2);
    expect(fetch).toHaveBeenCalledTimes(3);
    // La ventana avanza con el reloj: "últimas 24 h" se recalcula en cada refresco.
    expect(fetch).toHaveBeenLastCalledWith(new Date(2026, 8, 24, 10, 30, 10), {});
  });

  it('con "Todo" pide todo el histórico', async () => {
    fetch.mockReturnValue(of(usageMetrics()));
    execute(undefined);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledWith(new Date(0), {});
  });

  it('sigue refrescando tras un fallo', async () => {
    fetch.mockReturnValueOnce(throwError(() => new Error('500'))).mockReturnValue(of(usageMetrics()));
    const states = execute();

    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toMatchObject({ loaded: true, failed: true, metrics: null });

    await vi.advanceTimersByTimeAsync(USAGE_REFRESH_MS);
    expect(states.at(-1)).toMatchObject({ failed: false, metrics: usageMetrics() });
  });

  it('AC-38, AC-39: pide el Directorio del board y, si se quiere, el desglose', async () => {
    fetch.mockReturnValue(of(usageMetrics()));
    execute(HOUR, { directory: 'C:\Codev\demo', breakdown: true });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledWith(new Date(2026, 8, 25, 9, 30), { directory: 'C:\Codev\demo', breakdown: true });
  });

  it('no apila peticiones si una tarda más que el intervalo', async () => {
    const slow = new Subject<UsageMetrics>();
    fetch.mockReturnValue(slow);
    execute();

    await vi.advanceTimersByTimeAsync(USAGE_REFRESH_MS * 3);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
