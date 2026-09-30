import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';
import { LiveEvents } from '../events/application/live-events';
import { ObservedEvent } from '../events/models/observed-event';
import { observedEvent } from '../events/testing/event-fixtures';
import { AGENT_REFRESH_DEBOUNCE_MS, AgentProfileState, AgentsState, INITIAL_AGENTS, INITIAL_PROFILE, WatchAgents } from './application/watch-agents';
import { HttpAgentSource } from './infrastructure/http-agent-source';
import { AgentProfile, AgentQuery, AgentTypeList } from './models/agent';
import { AgentFilter, AgentSource } from './ports/agent-source';
import { launchesByDay } from './presentation/agent-labels';
import { AgentProfilePage } from './presentation/agent-profile-page/agent-profile-page';
import { AgentsPage } from './presentation/agents-page/agents-page';
import { SESSION_ID, agentLaunch, agentProfile, agentProfileDto, agentSummary, agentSummaryDto } from './testing/agent-fixtures';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const DAY = 24 * 60 * 60 * 1000;
const now = new Date(2026, 8, 25, 12, 0);

describe('AC-46: HttpAgentSource', () => {
  let http: HttpTestingController;
  let source: HttpAgentSource;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), HttpAgentSource] });
    http = TestBed.inject(HttpTestingController);
    source = TestBed.inject(HttpAgentSource);
  });

  afterEach(() => http.verify());

  it('pide la comparativa con su periodo y Proyecto, y la traduce', () => {
    let received: AgentTypeList | undefined;
    source.list({ since: new Date('2026-09-18T12:00:00.000Z'), project: 'demo' }).subscribe((l) => (received = l));

    const request = http.expectOne((r) => r.url === '/api/v1/agents');
    expect(request.request.params.get('since')).toBe('2026-09-18T12:00:00.000Z');
    expect(request.request.params.get('project')).toBe('demo');
    request.flush({ items: [agentSummaryDto()], facets: { projects: ['demo'] } });

    expect(received).toStrictEqual({ items: [agentSummary()], projects: ['demo'] });
  });

  it('pide el perfil de un Tipo, y "sin-tipo" para los que no tienen', () => {
    let received: AgentProfile | undefined;
    source.profile('e2e-builder', { since: new Date(0) }).subscribe((p) => (received = p));
    http.expectOne((r) => r.url === '/api/v1/agents/e2e-builder' && !r.params.has('project')).flush(agentProfileDto());
    expect(received).toStrictEqual(agentProfile());

    source.profile(null, { since: new Date(0) }).subscribe();
    http.expectOne((r) => r.url === '/api/v1/agents/sin-tipo').flush(agentProfileDto({ summary: agentSummaryDto({ type: null, launches: 0, last_at: '' }) }));
  });

  it('un Tipo sin Lanzamientos no tiene última vez', () => {
    let received: AgentProfile | undefined;
    source.profile('Plan', { since: new Date(0) }).subscribe((p) => (received = p));
    http.expectOne((r) => r.url === '/api/v1/agents/Plan').flush(agentProfileDto({ summary: agentSummaryDto({ type: 'Plan', launches: 0, last_at: '' }), launches: [] }));
    expect(received!.summary.lastAt).toBeNull();
  });
});

describe('AC-48: Lanzamientos por día', () => {
  it('cuenta por día local del periodo, con los días vacíos a cero', () => {
    const launches = [
      agentLaunch({ startedAt: new Date(2026, 8, 25, 9, 0) }),
      agentLaunch({ startedAt: new Date(2026, 8, 25, 1, 0) }),
      agentLaunch({ startedAt: new Date(2026, 8, 23, 23, 59) }),
    ];
    expect(launchesByDay(launches, now, 2 * DAY)).toStrictEqual([
      { label: '23/9', value: 1 },
      { label: '24/9', value: 0 },
      { label: '25/9', value: 2 },
    ]);
  });

  it('sin periodo empieza en el primer Lanzamiento, y sin Lanzamientos no hay días', () => {
    expect(launchesByDay([agentLaunch({ startedAt: new Date(2026, 8, 24, 10, 0) })], now)).toHaveLength(2);
    expect(launchesByDay([], now)).toStrictEqual([]);
  });
});

describe('AC-47, AC-48: WatchAgents', () => {
  let live: Subject<ObservedEvent[]>;
  let list: ReturnType<typeof vi.fn<(filter: AgentFilter) => Observable<AgentTypeList>>>;
  let profile: ReturnType<typeof vi.fn<(type: string | null, filter: AgentFilter) => Observable<AgentProfile>>>;

  function watch() {
    TestBed.configureTestingModule({
      providers: [
        { provide: AgentSource, useValue: { list, profile } },
        { provide: LiveEvents, useValue: { events$: live } },
      ],
    });
    return TestBed.inject(WatchAgents);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    live = new Subject<ObservedEvent[]>();
    list = vi.fn<(filter: AgentFilter) => Observable<AgentTypeList>>().mockReturnValue(of({ items: [agentSummary()], projects: ['demo'] }));
    profile = vi.fn<(type: string | null, filter: AgentFilter) => Observable<AgentProfile>>().mockReturnValue(of(agentProfile()));
  });

  afterEach(() => vi.useRealTimers());

  it('pide la comparativa del periodo y la vuelve a pedir con los Eventos de Subagente', async () => {
    const states: AgentsState[] = [];
    watch().list({ windowMs: 7 * DAY, project: 'demo' }).subscribe((s) => states.push(s));
    expect(list).toHaveBeenCalledWith({ since: new Date(now.getTime() - 7 * DAY), project: 'demo' });
    expect(states.at(-1)).toMatchObject({ loaded: true, failed: false, projects: ['demo'] });

    live.next([observedEvent({ eventType: 'tool.pre', toolName: 'Bash' })]);
    await vi.advanceTimersByTimeAsync(AGENT_REFRESH_DEBOUNCE_MS);
    expect(list).toHaveBeenCalledTimes(1);

    live.next([observedEvent({ eventType: 'subagent.stopped', toolName: null })]);
    await vi.advanceTimersByTimeAsync(AGENT_REFRESH_DEBOUNCE_MS);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('pide el perfil del Tipo y conserva el último si falla un refresco', async () => {
    const states: AgentProfileState[] = [];
    watch().profile(null, {}).subscribe((s) => states.push(s));
    expect(profile).toHaveBeenCalledWith(null, { since: new Date(0), project: undefined });

    profile.mockReturnValueOnce(throwError(() => new Error('500')));
    live.next([observedEvent({ eventType: 'tool.pre', toolName: 'Agent' })]);
    await vi.advanceTimersByTimeAsync(AGENT_REFRESH_DEBOUNCE_MS);
    expect(states.at(-1)).toMatchObject({ failed: true });
    expect(states.at(-1)!.profile).toStrictEqual(agentProfile());
  });
});

describe('AC-47: AgentsPage', () => {
  let state$: BehaviorSubject<AgentsState>;
  let queries: AgentQuery[];

  async function render(url = '/agentes') {
    queries = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'agentes', component: AgentsPage }]),
        { provide: WatchAgents, useValue: { list: (q: AgentQuery) => (queries.push(q), state$) } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness;
  }

  const el = (harness: RouterTestingHarness) => harness.routeNativeElement!;
  const rows = (harness: RouterTestingHarness) => [...el(harness).querySelectorAll('[data-testid="agent-type"]')];

  beforeEach(() => {
    state$ = new BehaviorSubject<AgentsState>({
      types: [agentSummary(), agentSummary({ type: 'security-gate', launches: 1, costPerLaunchUsd: 0.2, durationP50Ms: null }), agentSummary({ type: null, launches: 2 })],
      projects: ['demo'],
      loaded: true,
      failed: false,
    });
  });

  it('compara los Tipos por Lanzamientos y enlaza a cada perfil', async () => {
    const harness = await render();
    expect(rows(harness).map((r) => text(r.querySelector('a')))).toStrictEqual(['Explore', 'Sin Tipo', 'security-gate']);
    expect(text(rows(harness)[0])).toContain('3 min');
    expect(text(rows(harness)[0])).toContain('0,5');
    expect(rows(harness).map((r) => r.querySelector('a')!.getAttribute('href'))).toStrictEqual([
      '/agentes/Explore',
      '/agentes/sin-tipo',
      '/agentes/security-gate',
    ]);
    expect(queries).toStrictEqual([{ windowMs: 7 * DAY, project: undefined }]);
  });

  it('reordena por cualquier columna, con lo desconocido al final', async () => {
    const harness = await render();
    const cost = el(harness).querySelector('[data-column="cost"]') as HTMLButtonElement;
    cost.click();
    await harness.fixture.whenStable();
    expect(cost.closest('th')!.getAttribute('aria-sort')).toBe('descending');
    expect(text(rows(harness)[0]!.querySelector('a'))).toBe('security-gate');

    const duration = el(harness).querySelector('[data-column="duration"]') as HTMLButtonElement;
    duration.click();
    await harness.fixture.whenStable();
    duration.click();
    await harness.fixture.whenStable();
    expect(duration.closest('th')!.getAttribute('aria-sort')).toBe('ascending');
    expect(text(rows(harness).at(-1)!.querySelector('a'))).toBe('security-gate');
  });

  it('AC-59: la columna Bien muestra el % de +1 sobre los puntuados y — si no hay ninguno', async () => {
    state$.next({
      types: [
        agentSummary({ type: 'Explore', launches: 9, ratedUp: 3, ratedDown: 1 }),
        agentSummary({ type: 'Plan', launches: 5, ratedUp: 0, ratedDown: 2 }),
        agentSummary({ type: 'security-gate', launches: 1 }),
      ],
      projects: ['demo'],
      loaded: true,
      failed: false,
    });
    const harness = await render();
    const cell = (type: string) => text(rows(harness).find((r) => text(r.querySelector('a')) === type)!.querySelector('[data-column-cell="rating"]'));
    expect(text(el(harness).querySelector('[data-column="rating"]'))).toContain('Bien');
    expect([cell('Explore'), cell('Plan'), cell('security-gate')]).toStrictEqual(['75 %', '0 %', '—']);
  });

  it('AC-75: la columna Caché da la tasa de acierto y — sin datos, y ordena con lo desconocido como el menor', async () => {
    state$.next({
      types: [
        agentSummary({ type: 'Explore', launches: 9, cacheHitRate: 0.42 }),
        agentSummary({ type: 'Plan', launches: 5, cacheHitRate: null }),
        agentSummary({ type: 'security-gate', launches: 1, cacheHitRate: 0.9 }),
      ],
      projects: ['demo'],
      loaded: true,
      failed: false,
    });
    const harness = await render();
    const cell = (type: string) => text(rows(harness).find((r) => text(r.querySelector('a')) === type)!.querySelector('[data-column-cell="cache"]'));
    expect(text(el(harness).querySelector('[data-column="cache"]'))).toContain('Caché');
    expect([cell('Explore'), cell('Plan'), cell('security-gate')]).toStrictEqual(['42 %', '—', '90 %']);

    const cache = el(harness).querySelector('[data-column="cache"]') as HTMLButtonElement;
    cache.click();
    await harness.fixture.whenStable();
    expect(rows(harness).map((r) => text(r.querySelector('a')))).toStrictEqual(['security-gate', 'Explore', 'Plan']);
  });

  it('AC-59: ordenar por Bien deja los que no tienen puntuados como el menor', async () => {
    state$.next({
      types: [
        agentSummary({ type: 'Explore', launches: 9, ratedUp: 3, ratedDown: 1 }),
        agentSummary({ type: 'Plan', launches: 5, ratedUp: 0, ratedDown: 2 }),
        agentSummary({ type: 'security-gate', launches: 1 }),
      ],
      projects: ['demo'],
      loaded: true,
      failed: false,
    });
    const harness = await render();
    const rating = el(harness).querySelector('[data-column="rating"]') as HTMLButtonElement;
    rating.click();
    await harness.fixture.whenStable();
    expect(rating.closest('th')!.getAttribute('aria-sort')).toBe('descending');
    expect(rows(harness).map((r) => text(r.querySelector('a')))).toStrictEqual(['Explore', 'Plan', 'security-gate']);
    rating.click();
    await harness.fixture.whenStable();
    expect(rating.closest('th')!.getAttribute('aria-sort')).toBe('ascending');
    expect(rows(harness).map((r) => text(r.querySelector('a')))).toStrictEqual(['security-gate', 'Plan', 'Explore']);
  });

  it('el periodo y el Proyecto salen de la URL', async () => {
    const harness = await render('/agentes?periodo=24h&proyecto=demo');
    expect(queries.at(-1)).toStrictEqual({ windowMs: DAY, project: 'demo' });
    const select = el(harness).querySelector('[data-testid="project-filter"] select') as HTMLSelectElement;
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/agentes?periodo=24h');
  });

  it('sin Lanzamientos explica de dónde salen y un fallo se avisa', async () => {
    state$.next({ ...INITIAL_AGENTS, loaded: true });
    let harness = await render();
    expect(text(el(harness).querySelector('[data-testid="agents-empty"]'))).toContain('Ningún Lanzamiento en este periodo');

    TestBed.resetTestingModule();
    state$.next({ ...INITIAL_AGENTS, loaded: true, failed: true });
    harness = await render();
    expect(el(harness).querySelector('[data-testid="agents-error"]')).not.toBeNull();
  });
});

describe('AC-48: AgentProfilePage', () => {
  let state$: BehaviorSubject<AgentProfileState>;
  let requests: Array<[string | null, AgentQuery]>;

  async function render(url = '/agentes/Explore') {
    requests = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'agentes/:tipo', component: AgentProfilePage }, { path: 'agentes', children: [] }], withComponentInputBinding()),
        { provide: WatchAgents, useValue: { profile: (t: string | null, q: AgentQuery) => (requests.push([t, q]), state$) } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, AgentProfilePage);
    return harness;
  }

  const el = (harness: RouterTestingHarness) => harness.routeNativeElement!;

  beforeEach(() => {
    state$ = new BehaviorSubject<AgentProfileState>({ profile: agentProfile(), loaded: true, failed: false });
  });

  it('pide el perfil del Tipo de la URL con su periodo; "sin-tipo" es null', async () => {
    await render('/agentes/Explore?periodo=24h');
    expect(requests).toStrictEqual([['Explore', { windowMs: DAY, project: undefined }]]);

    TestBed.resetTestingModule();
    await render('/agentes/sin-tipo');
    expect(requests).toStrictEqual([[null, { windowMs: 7 * DAY, project: undefined }]]);
  });

  it('muestra quién lo lanza, sus fichas, el gráfico y lo que hace', async () => {
    const harness = await render();
    expect(text(el(harness).querySelector('h2'))).toBe('Explore');
    expect(text(el(harness).querySelector('[data-testid="profile-subtitle"]'))).toContain('Lanzado por el agente principal (4)');
    const kpis = text(el(harness).querySelector('[data-testid="profile-kpis"]'));
    expect(kpis).toContain('4');
    expect(kpis).toContain('3 min');
    expect(kpis).toContain('3 / 1');
    expect(el(harness).querySelector('app-bars-chart [role="img"]')?.getAttribute('aria-label')).toBe('Lanzamientos por día');
    expect(text(el(harness).querySelector('[data-testid="profile-tools"]'))).toContain('Read');
    const uses = text(el(harness).querySelector('[data-testid="profile-uses"]'));
    expect(uses).toContain('tdd (2)');
    expect(uses).toContain('playwright (3, 1 con error)');
    expect(uses).toContain('1 pasan · 1 fallan');
  });

  it('AC-59: muestra cuántos Subagentes están bien y mal puntuados', async () => {
    state$.next({ profile: agentProfile({ summary: agentSummary({ ratedUp: 3, ratedDown: 1 }) }), loaded: true, failed: false });
    const harness = await render();
    expect(text(el(harness).querySelector('[data-testid="profile-rating"]'))).toContain('3 bien · 1 mal');
  });

  it('AC-75: el perfil da la tasa y el ahorro neto del Tipo y de cada Lanzamiento, y explica por qué es baja', async () => {
    state$.next({
      profile: agentProfile({
        summary: agentSummary({ cacheHitRate: 0.42, cacheSavingsNetUsd: 1.5 }),
        launches: [agentLaunch({ cacheHitRate: 0.5, cacheSavingsNetUsd: 0.25 }), agentLaunch({ cacheHitRate: null, cacheSavingsNetUsd: null })],
      }),
      loaded: true,
      failed: false,
    });
    const harness = await render();
    const card = text(el(harness).querySelector('[data-testid="profile-cache"]'));
    expect(card).toContain('42 %');
    expect(card).toMatch(/Ahorro ~1,50\sUS\$/);
    const launches = [...el(harness).querySelectorAll('[data-testid="launch-cache"]')].map((c) => text(c));
    expect(launches[0]).toMatch(/^50 % · Ahorro ~0,25\sUS\$$/);
    expect(launches[1]).toBe('—');
    expect(text(el(harness).querySelector('[data-testid="cache-note"]'))).toContain('arranca con el contexto vacío');
  });

  it('AC-75: un ahorro neto negativo se llama Sobrecoste', async () => {
    state$.next({ profile: agentProfile({ summary: agentSummary({ cacheHitRate: 0.1, cacheSavingsNetUsd: -0.4 }) }), loaded: true, failed: false });
    const harness = await render();
    const card = el(harness).querySelector('[data-testid="profile-cache"]')!;
    expect(text(card)).toMatch(/Sobrecoste ~0,40\sUS\$/);
    expect(card.querySelector('.kpi__detail')!.getAttribute('data-tone')).toBe('danger');
  });

  it('AC-121: el perfil muestra los tokens y el nº de Sesiones del Tipo', async () => {
    state$.next({
      profile: agentProfile({ summary: agentSummary({ tokens: { input: 12_000, output: 3_000, cacheRead: 0, cacheCreation: 0 }, sessions: 5 }) }),
      loaded: true,
      failed: false,
    });
    const harness = await render();
    const tokens = text(el(harness).querySelector('[data-testid="profile-tokens"]'));
    expect(tokens).toContain('15');
    expect(tokens).toContain('entrada');
    expect(tokens).toContain('salida');
    expect(text(el(harness).querySelector('[data-testid="profile-sessions"]'))).toContain('5');
  });

  it('AC-59: sin Evaluaciones lo dice en lugar de mostrar ceros', async () => {
    const harness = await render();
    expect(text(el(harness).querySelector('[data-testid="profile-rating"]'))).toContain('Sin puntuar');
  });

  it('lista los Lanzamientos con su estado en texto y enlace al Subagente en su Sesión', async () => {
    state$.next({ profile: agentProfile({ launches: [agentLaunch({ status: 'no_response', stoppedAt: null, background: true })] }), loaded: true, failed: false });
    const harness = await render();
    const [launch] = [...el(harness).querySelectorAll('[data-testid="agent-launch"]')];
    expect(text(launch)).toContain('Sin respuesta');
    expect(text(launch)).toContain('Segundo');
    expect(text(launch)).toContain('Encontrados 3 ficheros');
    expect(launch!.querySelector('a')!.getAttribute('href')).toBe(`/sesiones/${SESSION_ID}?pestana=subagentes&subagente=a1`);
  });

  it('sin Lanzamientos en el periodo lo dice y ofrece volver', async () => {
    state$.next({ profile: agentProfile({ summary: agentSummary({ launches: 0 }), launches: [] }), loaded: true, failed: false });
    const harness = await render();
    const empty = el(harness).querySelector('[data-testid="profile-empty"]');
    expect(text(empty)).toContain('Ningún Lanzamiento de Explore en este periodo');
    expect(empty!.querySelector('a')!.getAttribute('href')).toBe('/agentes');
  });

  it('mientras carga lo dice', async () => {
    state$.next(INITIAL_PROFILE);
    const harness = await render();
    expect(text(el(harness))).toContain('Cargando el perfil');
  });
});
