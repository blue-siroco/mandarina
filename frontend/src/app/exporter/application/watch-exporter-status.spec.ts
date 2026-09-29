import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { ExporterStatus } from '../models/exporter';
import { ExporterSource } from '../ports/exporter-source';
import { exporterStatus } from '../testing/exporter-fixtures';
import {
  EXPORTER_REFRESH_MS,
  ExporterState,
  INITIAL_EXPORTER_STATE,
  WatchExporterStatus,
  reduceExporter,
} from './watch-exporter-status';

describe('AC-53: reduceExporter', () => {
  it('guarda el estado nuevo y limpia el fallo', () => {
    const status = exporterStatus();
    expect(reduceExporter({ ...INITIAL_EXPORTER_STATE, failed: true }, { ok: true, status })).toStrictEqual({
      status,
      loaded: true,
      failed: false,
    });
  });

  it('ante un fallo conserva el último estado conocido', () => {
    const status = exporterStatus();
    expect(reduceExporter({ status, loaded: true, failed: false }, { ok: false })).toStrictEqual({ status, loaded: true, failed: true });
  });
});

describe('AC-53: WatchExporterStatus', () => {
  let fetch: ReturnType<typeof vi.fn<() => Observable<ExporterStatus>>>;

  function setup() {
    TestBed.configureTestingModule({ providers: [{ provide: ExporterSource, useValue: { fetch } }] });
    return TestBed.inject(WatchExporterStatus);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    fetch = vi.fn(() => of(exporterStatus()));
  });

  afterEach(() => vi.useRealTimers());

  it('pide el estado nada más suscribirse y lo vuelve a pedir cada 30 s', async () => {
    const states: ExporterState[] = [];
    const subscription = setup()
      .execute()
      .subscribe((s) => states.push(s));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toStrictEqual({ status: exporterStatus(), loaded: true, failed: false });
    await vi.advanceTimersByTimeAsync(EXPORTER_REFRESH_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });

  it('un fallo se marca sin perder el último estado conocido', async () => {
    const states: ExporterState[] = [];
    const subscription = setup()
      .execute()
      .subscribe((s) => states.push(s));
    await vi.advanceTimersByTimeAsync(0);
    fetch.mockReturnValue(throwError(() => new Error('caído')));
    await vi.advanceTimersByTimeAsync(EXPORTER_REFRESH_MS);
    expect(states.at(-1)).toStrictEqual({ status: exporterStatus(), loaded: true, failed: true });
    subscription.unsubscribe();
  });

  it('empieza sin cargar', () => {
    const states: ExporterState[] = [];
    setup()
      .execute()
      .subscribe((s) => states.push(s))
      .unsubscribe();
    expect(states[0]).toStrictEqual(INITIAL_EXPORTER_STATE);
  });
});
