import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';
import { LiveEvents } from '../events/application/live-events';
import { ObservedEvent } from '../events/models/observed-event';
import { observedEvent } from '../events/testing/event-fixtures';
import { projectStatuses } from './application/test-status';
import {
  INITIAL_TEST_RUNS,
  TEST_REFRESH_DEBOUNCE_MS,
  TestRunsState,
  WatchTestRuns,
  reduceTestRuns,
} from './application/watch-test-runs';
import { HttpTestRunSource } from './infrastructure/http-test-run-source';
import { TestRunList } from './models/test-run';
import { TestRunSource } from './ports/test-run-source';
import { formatTestDuration, runnerLabel } from './presentation/test-labels';
import { TestsPage } from './presentation/tests-page/tests-page';
import { testRun, testRunDto } from './testing/test-run-fixtures';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

const now = new Date(2026, 8, 25, 18, 0);
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

// La más reciente primero, como la API.
const runs = [
  testRun({ id: 'e5:vitest', project: 'mandarina', kind: 'unit', status: 'passed', counts: { total: 12, passed: 12, failed: 0, skipped: 0 }, failures: [], finishedAt: minutesAgo(5) }),
  testRun({ id: 'e4:playwright', project: 'demo', kind: 'e2e', runner: 'playwright', command: 'npx playwright test', status: 'passed', counts: { total: 4, passed: 3, failed: 0, skipped: 1 }, failures: [], subagentId: 'agent-9a8b7c', finishedAt: minutesAgo(10) }),
  testRun({ id: 'e3:vitest', project: 'demo', kind: 'unit', finishedAt: minutesAgo(20) }),
  testRun({ id: 'e2:vitest', project: 'demo', kind: 'unit', status: 'passed', failures: [], counts: { total: 9, passed: 9, failed: 0, skipped: 0 }, finishedAt: minutesAgo(90) }),
];

describe('AC-27: HttpTestRunSource', () => {
  it('pide las Ejecuciones desde `since` y las traduce al modelo de la UI', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), HttpTestRunSource] });
    const http = TestBed.inject(HttpTestingController);
    let received: TestRunList | undefined;
    TestBed.inject(HttpTestRunSource)
      .fetch(new Date('2026-09-18T22:00:00.000Z'))
      .subscribe((list) => (received = list));

    const request = http.expectOne((r) => r.url === '/api/v1/test-runs');
    expect(request.request.params.get('since')).toBe('2026-09-18T22:00:00.000Z');
    request.flush({ items: [testRunDto()], facets: { projects: ['demo'] } });

    expect(received).toStrictEqual({ items: [testRun()], projects: ['demo'] });
    http.verify();
  });
});

describe('AC-28: projectStatuses', () => {
  it('toma la última Ejecución de cada Tipo de tests por Proyecto', () => {
    const statuses = projectStatuses(runs, ['demo', 'mandarina']);
    expect(statuses.map((s) => [s.project, s.unit?.id ?? null, s.e2e?.id ?? null])).toStrictEqual([
      ['demo', 'e3:vitest', 'e4:playwright'],
      ['mandarina', 'e5:vitest', null],
    ]);
  });

  it('incluye los Proyectos de las facetas aunque no tengan Ejecuciones tras filtrar', () => {
    expect(projectStatuses([], ['demo'])).toStrictEqual([{ project: 'demo', unit: null, e2e: null }]);
  });
});

describe('AC-28: etiquetas', () => {
  it.each([
    [320, '320 ms'],
    [1230, '1,2 s'],
    [95_000, '1 min'],
  ])('%d ms se muestra como %s', (ms, label) => expect(formatTestDuration(ms)).toBe(label));

  it('nombra los runners como los escribe cada proyecto', () => {
    expect(['vitest', 'jest', 'node-test', 'playwright'].map((r) => runnerLabel(r as never))).toStrictEqual([
      'Vitest',
      'Jest',
      'node:test',
      'Playwright',
    ]);
  });
});

describe('AC-28: reduceTestRuns', () => {
  it('ante un fallo conserva las últimas Ejecuciones conocidas', () => {
    const loaded = reduceTestRuns(INITIAL_TEST_RUNS, { ok: true, list: { items: runs, projects: ['demo'] } });
    expect(reduceTestRuns(loaded, { ok: false })).toStrictEqual({ ...loaded, failed: true });
  });
});

describe('AC-28: WatchTestRuns', () => {
  let live: Subject<ObservedEvent[]>;
  let fetch: ReturnType<typeof vi.fn<(since: Date) => Observable<TestRunList>>>;
  let states: TestRunsState[];

  function start() {
    TestBed.configureTestingModule({
      providers: [
        { provide: TestRunSource, useValue: { fetch } },
        { provide: LiveEvents, useValue: { events$: live } },
      ],
    });
    states = [];
    TestBed.inject(WatchTestRuns)
      .execute()
      .subscribe((s) => states.push(s));
  }

  const bashPost = (id: string) => observedEvent({ id, eventType: 'tool.post', toolName: 'Bash' });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    live = new Subject<ObservedEvent[]>();
    fetch = vi.fn<(since: Date) => Observable<TestRunList>>().mockReturnValue(of({ items: runs, projects: ['demo', 'mandarina'] }));
  });

  afterEach(() => vi.useRealTimers());

  it('pide las Ejecuciones desde las 00:00 de hace 6 días', () => {
    start();
    expect(fetch).toHaveBeenCalledWith(new Date(2026, 8, 19));
    expect(states.at(-1)).toMatchObject({ loaded: true, failed: false, projects: ['demo', 'mandarina'] });
    expect(states.at(-1)!.runs).toHaveLength(4);
  });

  it('vuelve a pedirlas cuando termina un comando Bash, agrupando las ráfagas', async () => {
    start();
    live.next([observedEvent({ eventType: 'tool.post', toolName: 'Read' }), observedEvent({ eventType: 'tool.pre' })]);
    await vi.advanceTimersByTimeAsync(TEST_REFRESH_DEBOUNCE_MS);
    expect(fetch).toHaveBeenCalledTimes(1);

    live.next([bashPost('a')]);
    live.next([bashPost('b')]);
    await vi.advanceTimersByTimeAsync(TEST_REFRESH_DEBOUNCE_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('si la carga falla lo indica y sigue escuchando', async () => {
    fetch.mockReturnValueOnce(throwError(() => new Error('500')));
    start();
    expect(states.at(-1)).toMatchObject({ loaded: true, failed: true, runs: [] });

    live.next([bashPost('a')]);
    await vi.advanceTimersByTimeAsync(TEST_REFRESH_DEBOUNCE_MS);
    expect(states.at(-1)).toMatchObject({ failed: false });
    expect(states.at(-1)!.runs).toHaveLength(4);
  });
});

describe('AC-28: TestsPage', () => {
  let state$: BehaviorSubject<TestRunsState>;

  async function render(url = '/tests') {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'tests', component: TestsPage }]),
        { provide: WatchTestRuns, useValue: { execute: () => state$ } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness;
  }

  const el = (harness: RouterTestingHarness) => harness.routeNativeElement!;
  const projects = (harness: RouterTestingHarness) => [...el(harness).querySelectorAll('[data-testid="test-project"]')];
  const suite = (project: Element, kind: string) => project.querySelector(`[data-testid="test-suite"][data-kind="${kind}"]`);
  const historyRows = (harness: RouterTestingHarness) => [...el(harness).querySelectorAll('[data-testid="test-run-row"]')];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    state$ = new BehaviorSubject<TestRunsState>({ runs, projects: ['demo', 'mandarina'], loaded: true, failed: false });
  });

  afterEach(() => vi.useRealTimers());

  it('muestra por Proyecto el Estado de los tests unitarios y E2E con texto', async () => {
    const harness = await render();
    const [demo, mandarina] = projects(harness);

    expect(text(demo?.querySelector('h3'))).toBe('demo');
    const unit = suite(demo!, 'unit');
    expect(unit?.getAttribute('data-status')).toBe('failed');
    expect(text(unit)).toContain('Fallan');
    expect(text(unit)).toContain('8 / 10');
    expect(text(unit)).toContain('1 fallido');
    expect(text(unit)).toContain('1 omitido');
    expect(text(unit)).toContain('1,2 s');
    expect(text(unit)).toContain('hace 20 min');
    expect(text(unit)).toContain('npx vitest run');

    const e2e = suite(demo!, 'e2e');
    expect(text(e2e)).toContain('Pasan');
    expect(text(e2e)).toContain('Playwright');
    expect(text(suite(mandarina!, 'e2e'))).toContain('Sin datos');
  });

  it('lista los tests fallidos de la última Ejecución con su AC', async () => {
    const harness = await render();
    const failures = [...suite(projects(harness)[0]!, 'unit')!.querySelectorAll('[data-testid="test-failure"]')];

    expect(failures).toHaveLength(1);
    expect(text(failures[0])).toContain('sum > AC-01: suma');
    expect(text(failures[0])).toContain('test/sum.test.ts');
    expect(text(failures[0])).toContain('AssertionError: expected 3 to be 4');
    expect(text(failures[0]?.querySelector('.badge'))).toBe('AC-01');
  });

  it('enlaza con la Sesión y el Subagente que lanzaron la Ejecución', async () => {
    const harness = await render();
    const links = [...suite(projects(harness)[0]!, 'e2e')!.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toStrictEqual([
      '/sesiones/7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33',
      '/sesiones/7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33?pestana=subagentes',
    ]);
  });

  it('muestra el historial de Ejecuciones', async () => {
    const harness = await render();
    const rows = historyRows(harness);
    expect(rows).toHaveLength(4);
    expect(text(rows[1])).toContain('E2E');
    expect(text(rows[1])).toContain('Pasan');
    expect(text(rows[1])).toContain('3 / 4');
  });

  it('filtra por Proyecto desde la URL y desde el selector', async () => {
    const harness = await render('/tests?proyecto=mandarina');
    expect(projects(harness)).toHaveLength(1);
    expect(historyRows(harness)).toHaveLength(1);

    await harness.navigateByUrl('/tests');
    const select = el(harness).querySelector('[data-testid="project-filter"] select') as HTMLSelectElement;
    select.value = 'demo';
    select.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/tests?proyecto=demo');
    expect(historyRows(harness)).toHaveLength(3);
  });

  it('sin Ejecuciones explica de dónde salen', async () => {
    state$.next({ ...INITIAL_TEST_RUNS, loaded: true });
    const harness = await render();
    expect(text(el(harness).querySelector('[data-testid="tests-empty"]'))).toContain('Ninguna Ejecución de tests en 7 días');
  });

  it('avisa si no se pudieron cargar', async () => {
    state$.next({ ...INITIAL_TEST_RUNS, loaded: true, failed: true });
    const harness = await render();
    expect(el(harness).querySelector('[data-testid="tests-error"]')).not.toBeNull();
  });
});
