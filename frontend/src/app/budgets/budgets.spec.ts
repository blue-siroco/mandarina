import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { LiveEvents } from '../events/application/live-events';
import { BudgetStateChange } from '../events/models/observed-event';
import { formatCost } from '../shared/format';
import { AUDIO_CONTEXT_FACTORY, AlertSound, MUTE_KEY } from './application/alert-sound';
import { alertMessage, alertsOf, budgetLabel, worstAlert } from './application/budget-alerts';
import { ManageBudgets, errorMessage } from './application/manage-budgets';
import { BUDGETS_REFRESH_MS, BudgetsState, INITIAL_BUDGETS, WatchBudgets, reduceBudgets } from './application/watch-budgets';
import { HttpBudgetSource } from './infrastructure/http-budget-source';
import { BudgetSource } from './ports/budget-source';
import {
  SESSION_ID,
  allowance,
  budget,
  budgetAllowanceDto,
  budgetDto,
  budgetList,
  budgetListDto,
  budgetSubjectDto,
  sessionBudget,
  stubBudgetSource,
} from './testing/budget-fixtures';

const input = {
  scope: 'global_day',
  project: null,
  limitUsd: 50,
  warnRatio: 0.8,
  action: 'stop',
  enabled: true,
} as const;

describe('AC-76: HttpBudgetSource', () => {
  let source: HttpBudgetSource;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpBudgetSource],
    });
    source = TestBed.inject(HttpBudgetSource);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista los Presupuestos y los traduce al modelo de la UI', () => {
    let received;
    source.list().subscribe((list) => (received = list));
    http.expectOne('/api/v1/budgets').flush(budgetListDto());
    expect(received).toStrictEqual(budgetList());
  });

  it('crea con POST y el cuerpo en snake_case', () => {
    source.create(input).subscribe();
    const request = http.expectOne('/api/v1/budgets');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toStrictEqual({
      scope: 'global_day',
      project: null,
      limit_usd: 50,
      warn_ratio: 0.8,
      action: 'stop',
      enabled: true,
    });
    request.flush(budgetDto());
  });

  it('edita y borra por id', () => {
    source.update('b 1', input).subscribe();
    const put = http.expectOne('/api/v1/budgets/b%201');
    expect(put.request.method).toBe('PUT');
    put.flush(budgetDto());
    source.remove('b1').subscribe();
    const del = http.expectOne('/api/v1/budgets/b1');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('AC-78: crea una excepción de Sesión o de Proyecto y la quita', () => {
    let created;
    source.addAllowance('b1', { sessionId: SESSION_ID }).subscribe((a) => (created = a));
    const session = http.expectOne('/api/v1/budgets/b1/allowances');
    expect(session.request.body).toStrictEqual({ session_id: SESSION_ID });
    session.flush(budgetAllowanceDto());
    expect(created).toStrictEqual(allowance());

    source.addAllowance('b1', { project: 'demo' }).subscribe();
    http.expectOne('/api/v1/budgets/b1/allowances').flush(
      budgetAllowanceDto({
        session_id: null,
        project: 'demo',
        until: '2026-09-26T00:00:00.000Z',
      }),
    );

    source.removeAllowance('b1', 'al1').subscribe();
    const del = http.expectOne('/api/v1/budgets/b1/allowances/al1');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
  });
});

describe('AC-82: WatchBudgets', () => {
  let changes: Subject<BudgetStateChange>;
  let lists: number;

  function setup(list: () => ReturnType<BudgetSource['list']>) {
    lists = 0;
    changes = new Subject<BudgetStateChange>();
    TestBed.configureTestingModule({
      providers: [
        { provide: BudgetSource, useValue: { list: () => ((lists += 1), list()) } },
        { provide: LiveEvents, useValue: { budgetChanges$: changes } },
      ],
    });
    return TestBed.inject(WatchBudgets);
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reduceBudgets guarda la lista o, si falla, conserva la anterior', () => {
    const list = budgetList();
    const loaded = reduceBudgets(INITIAL_BUDGETS, { ok: true, list });
    expect(loaded).toStrictEqual({ items: list.items, loaded: true, failed: false });
    expect(reduceBudgets(loaded, { ok: false })).toStrictEqual({
      items: list.items,
      loaded: true,
      failed: true,
    });
  });

  it('pide la lista al suscribirse, cada 30 s, al llegar un budget.state y al refrescar', async () => {
    const watch = setup(() => of(budgetList()));
    const states: BudgetsState[] = [];
    const subscription = watch.state$.subscribe((s) => states.push(s));
    await vi.advanceTimersByTimeAsync(0);
    expect(lists).toBe(1);
    expect(states.at(-1)).toMatchObject({ loaded: true, failed: false });

    await vi.advanceTimersByTimeAsync(BUDGETS_REFRESH_MS);
    expect(lists).toBe(2);
    changes.next({
      budgetId: 'b1',
      scope: 'global_day',
      project: null,
      sessionId: null,
      action: 'stop',
      state: 'exceeded',
      previousState: 'within',
      spentUsd: 6,
      limitUsd: 5,
    });
    expect(lists).toBe(3);
    watch.refresh();
    expect(lists).toBe(4);
    subscription.unsubscribe();
  });

  it('varios suscriptores comparten una sola petición', async () => {
    const watch = setup(() => of(budgetList()));
    const a = watch.state$.subscribe();
    const b = watch.state$.subscribe();
    await vi.advanceTimersByTimeAsync(0);
    expect(lists).toBe(1);
    a.unsubscribe();
    b.unsubscribe();
  });

  it('un fallo se marca sin perder la última lista', async () => {
    let fail = false;
    const watch = setup(() => (fail ? throwError(() => new Error('caído')) : of(budgetList())));
    const states: BudgetsState[] = [];
    const subscription = watch.state$.subscribe((s) => states.push(s));
    await vi.advanceTimersByTimeAsync(0);
    fail = true;
    await vi.advanceTimersByTimeAsync(BUDGETS_REFRESH_MS);
    expect(states.at(-1)).toStrictEqual({ items: budgetList().items, loaded: true, failed: true });
    subscription.unsubscribe();
  });
});

describe('AC-76, AC-78: ManageBudgets', () => {
  function setup(overrides: Parameters<typeof stubBudgetSource>[0] = {}) {
    const stub = stubBudgetSource(overrides);
    const refreshed = vi.fn();
    TestBed.configureTestingModule({
      providers: [stub.provider, { provide: WatchBudgets, useValue: { refresh: refreshed } }],
    });
    return { manage: TestBed.inject(ManageBudgets), calls: stub.calls, refreshed };
  }
  const run = async <T>(observable: { subscribe: (next: (value: T) => void) => unknown }) =>
    new Promise<T>((resolve) => observable.subscribe(resolve));

  it('crea o edita según haya id, y refresca la lista', async () => {
    const { manage, calls, refreshed } = setup();
    expect(await run(manage.save(null, input))).toStrictEqual({ ok: true });
    expect(await run(manage.save('b1', { ...input, limitUsd: 80 }))).toStrictEqual({ ok: true });
    expect(calls.create).toStrictEqual([input]);
    expect(calls.update).toStrictEqual([['b1', { ...input, limitUsd: 80 }]]);
    expect(refreshed).toHaveBeenCalledTimes(2);
  });

  it('activa o desactiva y amplía el límite sin tocar el resto', async () => {
    const { manage, calls } = setup();
    const original = budget({
      limit_usd: 5,
      warn_ratio: 0.5,
      action: 'warn',
      project: null,
      scope: 'global_day',
    });
    await run(manage.setEnabled(original, false));
    await run(manage.raiseLimit(original, 9));
    expect(calls.update).toStrictEqual([
      [
        'b1',
        {
          scope: 'global_day',
          project: null,
          limitUsd: 5,
          warnRatio: 0.5,
          action: 'warn',
          enabled: false,
        },
      ],
      [
        'b1',
        {
          scope: 'global_day',
          project: null,
          limitUsd: 9,
          warnRatio: 0.5,
          action: 'warn',
          enabled: true,
        },
      ],
    ]);
  });

  it('borra, da y quita excepciones', async () => {
    const { manage, calls } = setup();
    const b = sessionBudget();
    await run(manage.remove(b));
    await run(manage.allow(b, { sessionId: SESSION_ID }));
    await run(manage.removeAllowance(b, allowance()));
    expect(calls.remove).toStrictEqual(['b2']);
    expect(calls.addAllowance).toStrictEqual([['b2', { sessionId: SESSION_ID }]]);
    expect(calls.removeAllowance).toStrictEqual([['b2', 'al1']]);
  });

  it('un fallo devuelve el mensaje del servidor y no refresca', async () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: { message: 'El límite debe ser un número mayor que 0' },
    });
    const { manage, refreshed } = setup({ create: () => throwError(() => error) });
    expect(await run(manage.save(null, input))).toStrictEqual({
      ok: false,
      message: 'El límite debe ser un número mayor que 0',
    });
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('errorMessage cubre sin conexión y errores sin cuerpo', () => {
    expect(errorMessage(new HttpErrorResponse({ status: 0 }))).toBe('Sin conexión con Mandarina');
    expect(errorMessage(new HttpErrorResponse({ status: 500, error: 'boom' }))).toBe('No se pudo guardar el cambio');
    expect(errorMessage(new Error('x'), 'Otro')).toBe('Otro');
  });
});

describe('AC-83: qué avisa el peor Presupuesto', () => {
  const near = budget({
    id: 'n',
    scope: 'project_day',
    project: 'demo',
    limit_usd: 10,
    state: 'near',
    subjects: [budgetSubjectDto({ project: 'demo', spent_usd: 9, ratio: 0.9, state: 'near' })],
  });
  const over = budget({
    id: 'o',
    limit_usd: 50,
    state: 'exceeded',
    spent_usd: 52,
    subjects: [budgetSubjectDto({ spent_usd: 52, ratio: 1.04, state: 'exceeded' })],
  });

  it('elige el Superado sobre el Cerca y cuenta los demás', () => {
    const worst = worstAlert([near, over]);
    expect(worst?.budget.id).toBe('o');
    expect(worst?.more).toBe(1);
  });

  it('a igual estado manda la proporción más alta', () => {
    const lower = budget({ id: 'a', subjects: [budgetSubjectDto({ ratio: 0.9, state: 'near' })] });
    const higher = budget({
      id: 'b',
      subjects: [budgetSubjectDto({ ratio: 0.95, state: 'near' })],
    });
    expect(worstAlert([lower, higher])?.budget.id).toBe('b');
  });

  it('ignora los Presupuestos desactivados, los ámbitos con excepción vigente y los Dentro', () => {
    const disabled = { ...over, enabled: false };
    const allowed = budget({
      subjects: [budgetSubjectDto({ state: 'exceeded', allowed: true, ratio: 2 })],
    });
    const within = budget({ subjects: [budgetSubjectDto({ state: 'within' })] });
    expect(alertsOf([disabled, allowed, within])).toStrictEqual([]);
    expect(worstAlert([disabled, allowed, within])).toBeNull();
  });

  it('un Presupuesto por Sesión da un ámbito por Sesión cerca o superada', () => {
    const worst = worstAlert([sessionBudget()]);
    expect(worst?.subject.sessionId).toBe(SESSION_ID);
    expect(worst?.more).toBe(1);
  });

  it('el mensaje dice el ámbito, el estado, lo gastado y el límite', () => {
    const [overItem] = alertsOf([over]);
    const [nearItem] = alertsOf([near]);
    expect(alertMessage(overItem!)).toBe(`Presupuesto global del día superado: ${formatCost(52)} de ${formatCost(50)}`);
    expect(alertMessage(nearItem!)).toBe(`Presupuesto de demo del día cerca del límite: ${formatCost(9)} de ${formatCost(10)}`);
    expect(budgetLabel({ scope: 'session', project: null }, { sessionId: SESSION_ID })).toBe('Presupuesto por Sesión (7f3c2a10)');
    expect(budgetLabel({ scope: 'session', project: null })).toBe('Presupuesto por Sesión');
  });
});

describe('AC-83: AlertSound', () => {
  interface FakeContext {
    currentTime: number;
    destination: object;
    started: number[];
    createOscillator(): {
      frequency: { value: number };
      connect: () => unknown;
      start: (at: number) => void;
      stop: () => void;
    };
    createGain(): {
      gain: { setValueAtTime: () => void; exponentialRampToValueAtTime: () => void };
      connect: (next: unknown) => unknown;
    };
    resume(): Promise<void>;
  }

  let frequencies: number[];
  let created: number;

  function setup() {
    frequencies = [];
    created = 0;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AUDIO_CONTEXT_FACTORY,
          useValue: () => {
            created += 1;
            const context: FakeContext = {
              currentTime: 0,
              destination: {},
              started: [],
              createOscillator: () => {
                const oscillator = {
                  frequency: { value: 0 },
                  connect: () => oscillator,
                  start: () => frequencies.push(oscillator.frequency.value),
                  stop: () => undefined,
                };
                return oscillator;
              },
              createGain: () => ({
                gain: {
                  setValueAtTime: () => undefined,
                  exponentialRampToValueAtTime: () => undefined,
                },
                connect: (next: unknown) => next,
              }),
              resume: () => Promise.resolve(),
            };
            return context as unknown as AudioContext;
          },
        },
      ],
    });
    return TestBed.inject(AlertSound);
  }

  beforeEach(() => localStorage.clear());

  it('no suena hasta que la persona usuaria interactúa con la página', () => {
    const sound = setup();
    sound.play('exceeded');
    expect(created).toBe(0);
    document.dispatchEvent(new Event('pointerdown'));
    sound.play('exceeded');
    expect(created).toBe(1);
  });

  it('Cerca es un tono y Superado son dos, más graves', () => {
    const sound = setup();
    document.dispatchEvent(new Event('keydown'));
    sound.play('near');
    const near = [...frequencies];
    frequencies.length = 0;
    sound.play('exceeded');
    expect(near).toHaveLength(1);
    expect(frequencies).toHaveLength(2);
    expect(frequencies[0]).toBeLessThan(near[0]!);
  });

  it('AC-96: Esperando son dos tonos ascendentes, distintos de Cerca y Superado', () => {
    const sound = setup();
    document.dispatchEvent(new Event('keydown'));
    sound.play('waiting');
    const waiting = [...frequencies];
    frequencies.length = 0;
    sound.play('near');
    sound.play('exceeded');
    expect(waiting).toHaveLength(2);
    expect(waiting[1]).toBeGreaterThan(waiting[0]!);
    expect(frequencies).not.toContain(waiting[0]);
    expect(frequencies).not.toContain(waiting[1]);
  });

  it('AC-96: comparte el interruptor de silencio con los avisos de Presupuesto', () => {
    const sound = setup();
    document.dispatchEvent(new Event('pointerdown'));
    sound.setMuted(true);
    sound.play('waiting');
    expect(created).toBe(0);
  });

  it('silenciado no suena y se recuerda en el navegador', () => {
    const sound = setup();
    document.dispatchEvent(new Event('pointerdown'));
    expect(sound.muted()).toBe(false);
    sound.setMuted(true);
    sound.play('exceeded');
    expect(created).toBe(0);
    expect(localStorage.getItem(MUTE_KEY)).toBe('true');
    sound.setMuted(false);
    expect(localStorage.getItem(MUTE_KEY)).toBe('false');
  });

  it('empieza silenciado si así se guardó', () => {
    localStorage.setItem(MUTE_KEY, 'true');
    expect(setup().muted()).toBe(true);
  });

  it('sin almacenamiento o sin Web Audio no rompe', () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const sound = setup();
    expect(() => sound.setMuted(true)).not.toThrow();
    expect(sound.muted()).toBe(true);
    storage.mockRestore();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AUDIO_CONTEXT_FACTORY,
          useValue: () => {
            throw new Error('sin audio');
          },
        },
      ],
    });
    const silent = TestBed.inject(AlertSound);
    document.dispatchEvent(new Event('pointerdown'));
    expect(() => silent.play('near')).not.toThrow();
  });
});
