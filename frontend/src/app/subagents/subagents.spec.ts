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
  INITIAL_SUBAGENTS,
  SUBAGENT_REFRESH_DEBOUNCE_MS,
  SubagentsState,
  WatchSubagents,
  reduceSubagents,
} from './application/watch-subagents';
import { HttpSubagentSource } from './infrastructure/http-subagent-source';
import { SubagentList, SubagentQuery } from './models/subagent';
import { SubagentFilter, SubagentSource } from './ports/subagent-source';
import { SubagentsPage } from './presentation/subagents-page/subagents-page';
import { SESSION_ID, subagentItem, subagentItemDto } from './testing/subagent-fixtures';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

const now = new Date('2026-09-25T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

const list: SubagentList = {
  items: [
    subagentItem({ key: 'launch:t2', subagentId: null, toolUseId: 't2', agentType: 'e2e-builder', description: 'generar tests del AC-28', status: 'running', stoppedAt: null, tokens: null }),
    subagentItem(),
  ],
  projects: ['demo'],
  types: ['Explore', 'e2e-builder'],
};

describe('AC-35: HttpSubagentSource', () => {
  let http: HttpTestingController;
  let source: HttpSubagentSource;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), HttpSubagentSource] });
    http = TestBed.inject(HttpTestingController);
    source = TestBed.inject(HttpSubagentSource);
  });

  afterEach(() => http.verify());

  it('pide los Subagentes con sus filtros y los traduce al modelo de la UI', () => {
    let received: SubagentList | undefined;
    source.fetch({ since: new Date('2026-09-24T12:00:00.000Z'), project: 'demo', type: 'Explore', includeInternal: true }).subscribe((l) => (received = l));

    const request = http.expectOne((r) => r.url === '/api/v1/subagents');
    expect(request.request.params.get('since')).toBe('2026-09-24T12:00:00.000Z');
    expect(request.request.params.get('project')).toBe('demo');
    expect(request.request.params.get('type')).toBe('Explore');
    expect(request.request.params.get('include_internal')).toBe('true');
    request.flush({ items: [subagentItemDto()], facets: { projects: ['demo'], types: ['Explore'] } });

    expect(received).toStrictEqual({ items: [subagentItem()], projects: ['demo'], types: ['Explore'] });
  });

  it('sin filtros solo envía `since`, y un pendiente se identifica por su lanzamiento', () => {
    let received: SubagentList | undefined;
    source.fetch({ since: new Date(0) }).subscribe((l) => (received = l));

    const request = http.expectOne((r) => r.url === '/api/v1/subagents');
    expect(request.request.params.keys()).toStrictEqual(['since']);
    request.flush({ items: [subagentItemDto({ subagent_id: null, tool_use_id: 't9' })], facets: { projects: [], types: [] } });

    expect(received?.items[0]).toMatchObject({ key: 'launch:t9', subagentId: null });
  });
});

describe('AC-37: reduceSubagents', () => {
  it('ante un fallo conserva los últimos Subagentes conocidos', () => {
    const loaded = reduceSubagents(INITIAL_SUBAGENTS, { ok: true, list });
    expect(loaded).toMatchObject({ loaded: true, failed: false, types: ['Explore', 'e2e-builder'] });
    expect(reduceSubagents(loaded, { ok: false })).toStrictEqual({ ...loaded, failed: true });
  });
});

describe('AC-37: WatchSubagents', () => {
  let live: Subject<ObservedEvent[]>;
  let fetch: ReturnType<typeof vi.fn<(filter: SubagentFilter) => Observable<SubagentList>>>;
  let states: SubagentsState[];

  function start(query: SubagentQuery) {
    TestBed.configureTestingModule({
      providers: [
        { provide: SubagentSource, useValue: { fetch } },
        { provide: LiveEvents, useValue: { events$: live } },
      ],
    });
    states = [];
    TestBed.inject(WatchSubagents)
      .execute(query)
      .subscribe((s) => states.push(s));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    live = new Subject<ObservedEvent[]>();
    fetch = vi.fn<(filter: SubagentFilter) => Observable<SubagentList>>().mockReturnValue(of(list));
  });

  afterEach(() => vi.useRealTimers());

  it('pide la ventana hacia atrás desde ahora con los filtros', () => {
    start({ windowMs: 24 * HOUR, type: 'Explore', includeInternal: false });
    expect(fetch).toHaveBeenCalledWith({ since: new Date(now.getTime() - 24 * HOUR), project: undefined, type: 'Explore', includeInternal: false });
    expect(states.at(-1)!.subagents).toHaveLength(2);
  });

  it('vuelve a pedirlos con un Evento de Subagente o de Agent, agrupando las ráfagas', async () => {
    start({ windowMs: HOUR });
    live.next([observedEvent({ eventType: 'tool.post', toolName: 'Bash' })]);
    await vi.advanceTimersByTimeAsync(SUBAGENT_REFRESH_DEBOUNCE_MS);
    expect(fetch).toHaveBeenCalledTimes(1);

    live.next([observedEvent({ eventType: 'tool.pre', toolName: 'Agent' })]);
    live.next([observedEvent({ eventType: 'subagent.started', toolName: null })]);
    await vi.advanceTimersByTimeAsync(SUBAGENT_REFRESH_DEBOUNCE_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('si la carga falla lo indica y sigue escuchando', async () => {
    fetch.mockReturnValueOnce(throwError(() => new Error('500')));
    start({});
    expect(states.at(-1)).toMatchObject({ loaded: true, failed: true });

    live.next([observedEvent({ eventType: 'subagent.stopped', toolName: null })]);
    await vi.advanceTimersByTimeAsync(SUBAGENT_REFRESH_DEBOUNCE_MS);
    expect(states.at(-1)).toMatchObject({ failed: false });
  });
});

describe('AC-37: SubagentsPage', () => {
  let state$: BehaviorSubject<SubagentsState>;
  let queries: SubagentQuery[];

  async function render(url = '/subagentes') {
    queries = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'subagentes', component: SubagentsPage }]),
        { provide: WatchSubagents, useValue: { execute: (q: SubagentQuery) => (queries.push(q), state$) } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness;
  }

  const el = (harness: RouterTestingHarness) => harness.routeNativeElement!;
  const items = (harness: RouterTestingHarness) => [...el(harness).querySelectorAll('[data-testid="subagent-item"]')];

  beforeEach(() => {
    state$ = new BehaviorSubject<SubagentsState>({ subagents: list.items, projects: list.projects, types: list.types, loaded: true, failed: false });
  });

  it('AC-47: ya no agrega por Tipo, y cada Tipo enlaza a su perfil', async () => {
    const harness = await render();
    expect(el(harness).querySelector('[data-testid="subagent-type"]')).toBeNull();
    const links = items(harness).map((i) => i.querySelector('a')!.getAttribute('href'));
    expect(links).toStrictEqual(['/agentes/e2e-builder', '/agentes/Explore']);
  });

  it('AC-45: un Lanzamiento sin respuesta lo dice con texto, y uno sin Tipo enlaza a "sin-tipo"', async () => {
    state$.next({ ...state$.value, subagents: [subagentItem({ agentType: null, status: 'no_response', stoppedAt: null })] });
    const harness = await render();
    expect(text(items(harness)[0])).toContain('Sin respuesta');
    expect(text(items(harness)[0])).toContain('Sin Tipo');
    expect(items(harness)[0]!.querySelector('a')!.getAttribute('href')).toBe('/agentes/sin-tipo');
  });

  it('lista los Subagentes con su estado en texto y enlaza al detalle con el Subagente desplegado', async () => {
    const harness = await render();
    const [pending, finished] = items(harness);

    expect(text(pending)).toContain('e2e-builder');
    expect(text(pending)).toContain('generar tests del AC-28');
    expect(text(pending)).toContain('En marcha');
    expect(text(finished)).toContain('Terminado');
    expect(pending!.querySelector('a[href^="/sesiones"]')!.getAttribute('href')).toBe(`/sesiones/${SESSION_ID}?pestana=subagentes&subagente=launch:t2`);
    expect(finished!.querySelector('a[href^="/sesiones"]')!.getAttribute('href')).toBe(`/sesiones/${SESSION_ID}?pestana=subagentes&subagente=a1`);
  });

  it('por defecto pide 24 h sin internos, y los filtros salen de la URL', async () => {
    const harness = await render();
    expect(queries).toStrictEqual([{ windowMs: 24 * HOUR, project: undefined, type: undefined, includeInternal: false }]);

    await harness.navigateByUrl('/subagentes?periodo=7d&tipo=Explore&proyecto=demo&internos=1');
    expect(queries.at(-1)).toStrictEqual({ windowMs: 7 * 24 * HOUR, project: 'demo', type: 'Explore', includeInternal: true });
  });

  it('los selectores y la casilla escriben la URL', async () => {
    const harness = await render();
    const select = el(harness).querySelector('[data-testid="type-filter"] select') as HTMLSelectElement;
    select.value = 'Explore';
    select.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    (el(harness).querySelector('[data-testid="internal-filter"] input') as HTMLInputElement).click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/subagentes?tipo=Explore&internos=1');
  });

  it('marca los internos cuando se muestran', async () => {
    state$.next({ ...state$.value, subagents: [subagentItem({ key: 'x1', subagentId: 'x1', agentType: null, internal: true, description: null })] });
    const harness = await render('/subagentes?internos=1');
    expect(text(items(harness)[0])).toContain('interno');
  });

  it('sin Subagentes explica de dónde salen', async () => {
    state$.next({ ...INITIAL_SUBAGENTS, loaded: true });
    const harness = await render();
    expect(text(el(harness).querySelector('[data-testid="subagents-empty"]'))).toContain('Ningún Subagente en este periodo');
  });

  it('avisa si no se pudieron cargar', async () => {
    state$.next({ ...INITIAL_SUBAGENTS, loaded: true, failed: true });
    const harness = await render();
    expect(el(harness).querySelector('[data-testid="subagents-error"]')).not.toBeNull();
  });
});
