import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';
import { LiveEvents } from '../events/application/live-events';
import { ObservedEvent } from '../events/models/observed-event';
import { observedEvent } from '../events/testing/event-fixtures';
import {
  INITIAL_SKILL_INVOCATIONS,
  SKILL_REFRESH_DEBOUNCE_MS,
  SkillInvocationsState,
  WatchSkillInvocations,
  reduceSkillInvocations,
} from './application/watch-skill-invocations';
import { HttpSkillInvocationSource } from './infrastructure/http-skill-invocation-source';
import { SkillInvocationList, SkillInvocationQuery } from './models/skill-invocation';
import { SkillInvocationSource } from './ports/skill-invocation-source';
import { invokerLabel } from './presentation/skill-labels';
import { SkillsPage } from './presentation/skills-page/skills-page';
import {
  SESSION_ID,
  skillInvocation,
  skillInvocationDto,
  skillUsage,
  skillUsageDto,
} from './testing/skill-invocation-fixtures';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

const now = new Date('2026-09-25T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const DAY = 24 * 60 * 60 * 1000;

const list: SkillInvocationList = {
  items: [
    skillInvocation({ id: 'i3', project: 'demo', skill: 'tdd', invoker: 'subagent', subagentType: 'e2e-builder', startedAt: minutesAgo(5) }),
    skillInvocation({ id: 'i2', project: 'lucia', skill: 'commit', invoker: 'user', args: null, startedAt: minutesAgo(20) }),
    skillInvocation({ id: 'i1', project: 'demo', skill: 'tdd', invoker: 'agent', status: 'running', startedAt: minutesAgo(90) }),
  ],
  stats: [
    skillUsage({ project: 'demo', skill: 'tdd', total: 2, byInvoker: { agent: 1, subagent: 1, user: 0 }, lastAt: minutesAgo(5) }),
    skillUsage({ project: 'lucia', skill: 'commit', total: 1, byInvoker: { agent: 0, subagent: 0, user: 1 }, lastAt: minutesAgo(20) }),
  ],
  projects: ['demo', 'lucia'],
};

describe('AC-30: HttpSkillInvocationSource', () => {
  let http: HttpTestingController;
  let source: HttpSkillInvocationSource;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), HttpSkillInvocationSource] });
    http = TestBed.inject(HttpTestingController);
    source = TestBed.inject(HttpSkillInvocationSource);
  });

  afterEach(() => http.verify());

  it('pide las invocaciones desde `since` y las traduce al modelo de la UI', () => {
    let received: SkillInvocationList | undefined;
    source.fetch(new Date('2026-09-18T12:00:00.000Z')).subscribe((l) => (received = l));

    const request = http.expectOne((r) => r.url === '/api/v1/skill-invocations');
    expect(request.request.params.get('since')).toBe('2026-09-18T12:00:00.000Z');
    expect(request.request.params.has('session_id')).toBe(false);
    request.flush({ items: [skillInvocationDto()], stats: [skillUsageDto()], facets: { projects: ['demo'] } });

    expect(received).toStrictEqual({ items: [skillInvocation()], stats: [skillUsage()], projects: ['demo'] });
  });

  it('filtra por Sesión y traduce las invocaciones sin fin', () => {
    let received: SkillInvocationList | undefined;
    source.fetch(new Date(0), SESSION_ID).subscribe((l) => (received = l));

    const request = http.expectOne((r) => r.url === '/api/v1/skill-invocations');
    expect(request.request.params.get('session_id')).toBe(SESSION_ID);
    request.flush({
      items: [skillInvocationDto({ status: 'running', ended_at: null, duration_ms: null })],
      stats: [],
      facets: { projects: [] },
    });

    expect(received?.items[0]).toMatchObject({ status: 'running', endedAt: null, durationMs: null });
  });

  it('AC-29: traduce la de un Subagente que solo consta en su Transcript', () => {
    let received: SkillInvocationList | undefined;
    source.fetch(new Date(0)).subscribe((l) => (received = l));

    http.expectOne((r) => r.url === '/api/v1/skill-invocations').flush({
      items: [skillInvocationDto({ id: 'transcript:toolu_9', event_id: null, invoker: 'subagent', subagent_id: 'a1', subagent_type: 'ui-builder' })],
      stats: [],
      facets: { projects: [] },
    });

    expect(received?.items[0]).toMatchObject({ id: 'transcript:toolu_9', eventId: null, invoker: 'subagent', subagentType: 'ui-builder' });
  });
});

describe('AC-31: etiquetas', () => {
  it('nombra al Subagente por su tipo y a los demás por su papel', () => {
    expect(invokerLabel({ invoker: 'subagent', subagentType: 'e2e-builder' })).toBe('e2e-builder');
    expect(invokerLabel({ invoker: 'subagent', subagentType: null })).toBe('Subagente');
    expect(invokerLabel({ invoker: 'user', subagentType: null })).toBe('Persona usuaria');
    expect(invokerLabel({ invoker: 'agent', subagentType: null })).toBe('Agente');
  });
});

describe('AC-32: reduceSkillInvocations', () => {
  it('ante un fallo conserva las últimas invocaciones conocidas', () => {
    const loaded = reduceSkillInvocations(INITIAL_SKILL_INVOCATIONS, { ok: true, list });
    expect(loaded).toMatchObject({ loaded: true, failed: false, projects: ['demo', 'lucia'] });
    expect(reduceSkillInvocations(loaded, { ok: false })).toStrictEqual({ ...loaded, failed: true });
  });
});

describe('AC-31, AC-32: WatchSkillInvocations', () => {
  let live: Subject<ObservedEvent[]>;
  let fetch: ReturnType<typeof vi.fn<(since: Date, sessionId?: string) => Observable<SkillInvocationList>>>;
  let states: SkillInvocationsState[];

  function start(query: SkillInvocationQuery) {
    TestBed.configureTestingModule({
      providers: [
        { provide: SkillInvocationSource, useValue: { fetch } },
        { provide: LiveEvents, useValue: { events$: live } },
      ],
    });
    states = [];
    TestBed.inject(WatchSkillInvocations)
      .execute(query)
      .subscribe((s) => states.push(s));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    live = new Subject<ObservedEvent[]>();
    fetch = vi.fn<(since: Date, sessionId?: string) => Observable<SkillInvocationList>>().mockReturnValue(of(list));
  });

  afterEach(() => vi.useRealTimers());

  it('pide la ventana hacia atrás desde ahora, o todo el histórico sin ventana', () => {
    start({ windowMs: 7 * DAY });
    expect(fetch).toHaveBeenCalledWith(new Date(now.getTime() - 7 * DAY), undefined);
    expect(states.at(-1)).toMatchObject({ loaded: true, failed: false });
    expect(states.at(-1)!.invocations).toHaveLength(3);

    TestBed.resetTestingModule();
    start({ sessionId: SESSION_ID });
    expect(fetch).toHaveBeenLastCalledWith(new Date(0), SESSION_ID);
  });

  it('vuelve a pedirlas cuando llega un Evento de Skill, un prompt o el fin de un Turno, agrupando las ráfagas', async () => {
    start({ windowMs: DAY });
    live.next([observedEvent({ eventType: 'tool.post', toolName: 'Bash' }), observedEvent({ eventType: 'tool.pre', toolName: 'Read' })]);
    await vi.advanceTimersByTimeAsync(SKILL_REFRESH_DEBOUNCE_MS);
    expect(fetch).toHaveBeenCalledTimes(1);

    live.next([observedEvent({ eventType: 'tool.pre', toolName: 'Skill' })]);
    live.next([observedEvent({ eventType: 'prompt.submitted' })]);
    await vi.advanceTimersByTimeAsync(SKILL_REFRESH_DEBOUNCE_MS);
    expect(fetch).toHaveBeenCalledTimes(2);

    live.next([observedEvent({ eventType: 'turn.ended' })]);
    await vi.advanceTimersByTimeAsync(SKILL_REFRESH_DEBOUNCE_MS);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('para una Sesión solo reacciona a sus Eventos', async () => {
    start({ sessionId: SESSION_ID });
    live.next([observedEvent({ eventType: 'prompt.submitted', sessionId: 'otra' })]);
    await vi.advanceTimersByTimeAsync(SKILL_REFRESH_DEBOUNCE_MS);
    expect(fetch).toHaveBeenCalledTimes(1);

    live.next([observedEvent({ eventType: 'prompt.submitted', sessionId: SESSION_ID })]);
    await vi.advanceTimersByTimeAsync(SKILL_REFRESH_DEBOUNCE_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('si la carga falla lo indica y sigue escuchando', async () => {
    fetch.mockReturnValueOnce(throwError(() => new Error('500')));
    start({ windowMs: DAY });
    expect(states.at(-1)).toMatchObject({ loaded: true, failed: true, invocations: [] });

    live.next([observedEvent({ eventType: 'tool.pre', toolName: 'Skill' })]);
    await vi.advanceTimersByTimeAsync(SKILL_REFRESH_DEBOUNCE_MS);
    expect(states.at(-1)).toMatchObject({ failed: false });
  });
});

describe('AC-32: SkillsPage', () => {
  let state$: BehaviorSubject<SkillInvocationsState>;
  let queries: SkillInvocationQuery[];

  async function render(url = '/skills') {
    queries = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'skills', component: SkillsPage }]),
        { provide: WatchSkillInvocations, useValue: { execute: (q: SkillInvocationQuery) => (queries.push(q), state$) } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness;
  }

  const el = (harness: RouterTestingHarness) => harness.routeNativeElement!;
  const usageRows = (harness: RouterTestingHarness) => [...el(harness).querySelectorAll('[data-testid="skill-usage"]')];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    state$ = new BehaviorSubject<SkillInvocationsState>({
      invocations: list.items,
      stats: list.stats,
      projects: list.projects,
      loaded: true,
      failed: false,
    });
  });

  afterEach(() => vi.useRealTimers());

  it('muestra una fila por Proyecto y skill con el total, el reparto y la última invocación', async () => {
    const harness = await render();
    const [tdd, commit] = usageRows(harness);

    expect(usageRows(harness)).toHaveLength(2);
    expect(text(tdd)).toContain('demo');
    expect(text(tdd)).toContain('tdd');
    expect(text(tdd)).toContain('2');
    expect(text(tdd)).toContain('1 · 0 · 1');
    expect(text(tdd)).toContain('hace 5 min');
    expect(text(commit)).toContain('0 · 1 · 0');
  });

  it('por defecto pide los últimos 7 días y el periodo sale de la URL', async () => {
    const harness = await render();
    expect(queries).toStrictEqual([{ windowMs: 7 * DAY }]);
    expect(text(el(harness).querySelector('.page-header__subtitle'))).toContain('Últimos 7 días');

    await harness.navigateByUrl('/skills?periodo=todo');
    expect(queries.at(-1)).toStrictEqual({ windowMs: undefined });
    expect(text(el(harness).querySelector('.page-header__subtitle'))).toContain('Todo el histórico');
  });

  it('al desplegar una fila muestra sus invocaciones con enlace a la pestaña Skills de la Sesión', async () => {
    const harness = await render();
    const button = usageRows(harness)[0]!.querySelector('button')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');

    button.click();
    await harness.fixture.whenStable();

    expect(button.getAttribute('aria-expanded')).toBe('true');
    const invocations = [...el(harness).querySelectorAll('[data-testid="skill-usage-invocation"]')];
    expect(invocations).toHaveLength(2);
    expect(text(invocations[0])).toContain('e2e-builder');
    expect(text(invocations[0])).toContain('Terminada');
    expect(text(invocations[1])).toContain('En curso');
    expect(invocations[0]!.querySelector('a')!.getAttribute('href')).toBe(`/sesiones/${SESSION_ID}?pestana=skills`);
  });

  it('filtra por Proyecto desde la URL y desde el selector', async () => {
    const harness = await render('/skills?proyecto=lucia');
    expect(usageRows(harness)).toHaveLength(1);

    await harness.navigateByUrl('/skills');
    const select = el(harness).querySelector('[data-testid="project-filter"] select') as HTMLSelectElement;
    select.value = 'demo';
    select.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/skills?proyecto=demo');
    expect(usageRows(harness)).toHaveLength(1);
  });

  it('sin invocaciones explica de dónde salen', async () => {
    state$.next({ ...INITIAL_SKILL_INVOCATIONS, loaded: true });
    const harness = await render();
    const empty = text(el(harness).querySelector('[data-testid="skills-empty"]'));
    expect(empty).toContain('Ninguna skill usada en este periodo');
    expect(empty).toContain('/nombre');
  });

  it('avisa si no se pudieron cargar', async () => {
    state$.next({ ...INITIAL_SKILL_INVOCATIONS, loaded: true, failed: true });
    const harness = await render();
    expect(el(harness).querySelector('[data-testid="skills-error"]')).not.toBeNull();
  });
});
