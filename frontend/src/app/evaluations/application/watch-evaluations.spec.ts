import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { EvaluationFilter, EvaluationList } from '../models/evaluation';
import { EvaluationSource } from '../ports/evaluation-source';
import { evaluationList } from '../testing/evaluation-fixtures';
import {
  EVALUATIONS_REFRESH_MS,
  EvaluationsState,
  INITIAL_EVALUATIONS,
  WatchEvaluations,
  reduceEvaluations,
} from './watch-evaluations';

describe('AC-58: reduceEvaluations', () => {
  it('guarda la lista nueva y limpia el fallo', () => {
    const list = evaluationList();
    expect(reduceEvaluations({ ...INITIAL_EVALUATIONS, failed: true }, { ok: true, list })).toStrictEqual({
      items: list.items,
      tags: list.tags,
      projects: list.projects,
      loaded: true,
      failed: false,
    });
  });

  it('ante un fallo conserva la última lista conocida', () => {
    const list = evaluationList();
    const state = reduceEvaluations(INITIAL_EVALUATIONS, { ok: true, list });
    expect(reduceEvaluations(state, { ok: false })).toStrictEqual({ ...state, loaded: true, failed: true });
  });
});

describe('AC-58: WatchEvaluations', () => {
  let list: ReturnType<typeof vi.fn<(filter: EvaluationFilter) => Observable<EvaluationList>>>;

  function setup() {
    TestBed.configureTestingModule({ providers: [{ provide: EvaluationSource, useValue: { list, exportUrl: (f: EvaluationFilter) => `export:${JSON.stringify(f)}` } }] });
    return TestBed.inject(WatchEvaluations);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T12:00:00.000Z'));
    list = vi.fn(() => of(evaluationList()));
  });

  afterEach(() => vi.useRealTimers());

  it('pide la lista al suscribirse, con el periodo convertido en `since`, y cada 30 s', async () => {
    const states: EvaluationsState[] = [];
    const subscription = setup()
      .execute({ windowMs: 3_600_000, score: 'down', tag: 'bug-fix', project: 'demo', objectTypes: ['turn'] })
      .subscribe((s) => states.push(s));
    await vi.advanceTimersByTimeAsync(0);
    expect(list).toHaveBeenCalledExactlyOnceWith({
      score: 'down',
      tag: 'bug-fix',
      project: 'demo',
      objectTypes: ['turn'],
      since: new Date('2026-09-25T11:00:00.000Z'),
    });
    expect(states.at(-1)?.loaded).toBe(true);
    await vi.advanceTimersByTimeAsync(EVALUATIONS_REFRESH_MS);
    expect(list).toHaveBeenCalledTimes(2);
    // La ventana avanza con el reloj.
    expect(list.mock.calls[1]?.[0].since).toStrictEqual(new Date('2026-09-25T11:00:30.000Z'));
    subscription.unsubscribe();
  });

  it('sin periodo pide todo el histórico', async () => {
    const subscription = setup().execute({}).subscribe();
    await vi.advanceTimersByTimeAsync(0);
    expect(list.mock.calls[0]?.[0].since).toBeUndefined();
    subscription.unsubscribe();
  });

  it('un fallo se marca sin perder la última lista', async () => {
    const states: EvaluationsState[] = [];
    const subscription = setup()
      .execute()
      .subscribe((s) => states.push(s));
    await vi.advanceTimersByTimeAsync(0);
    list.mockReturnValue(throwError(() => new Error('caído')));
    await vi.advanceTimersByTimeAsync(EVALUATIONS_REFRESH_MS);
    expect(states.at(-1)).toMatchObject({ failed: true, loaded: true, items: evaluationList().items });
    subscription.unsubscribe();
  });

  it('la URL de exportación usa los filtros vigentes', () => {
    const url = setup().exportUrl({ windowMs: 60_000, score: 'up' });
    expect(url).toBe(`export:${JSON.stringify({ score: 'up', since: new Date('2026-09-25T11:59:00.000Z') })}`);
  });
});
