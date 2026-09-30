import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';
import { LiveEvents } from '../events/application/live-events';
import { ObservedEvent } from '../events/models/observed-event';
import { observedEvent } from '../events/testing/event-fixtures';
import { INITIAL_MCP, MCP_REFRESH_DEBOUNCE_MS, McpState, WatchMcpInvocations, reduceMcp } from './application/watch-mcp-invocations';
import { HttpMcpSource } from './infrastructure/http-mcp-source';
import { McpInvocationList, McpQuery } from './models/mcp';
import { McpFilter, McpSource } from './ports/mcp-source';
import { formatBytes, formatLatency } from './presentation/mcp-labels';
import { McpPage } from './presentation/mcp-page/mcp-page';
import { SESSION_ID, mcpInvocation, mcpInvocationDto, mcpServerUsage, mcpServerUsageDto, mcpToolUsage } from './testing/mcp-fixtures';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const plain = (value: string) => value.replace(/\s/g, ' ');

const now = new Date('2026-09-25T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const list: McpInvocationList = {
  items: [mcpInvocation()],
  servers: [mcpServerUsage(), mcpServerUsage({ server: 'claude_ai_Claude_Docs', scopes: [], calls: 1, hasImage: false, tools: [] })],
  unusedDeferred: [],
  projects: ['demo'],
  serverNames: ['claude_ai_Claude_Docs', 'playwright'],
};

describe('AC-42: HttpMcpSource', () => {
  let http: HttpTestingController;
  let source: HttpMcpSource;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), HttpMcpSource] });
    http = TestBed.inject(HttpTestingController);
    source = TestBed.inject(HttpMcpSource);
  });

  afterEach(() => http.verify());

  it('pide las invocaciones con sus filtros y las traduce al modelo de la UI', () => {
    let received: McpInvocationList | undefined;
    source.fetch({ since: new Date('2026-09-18T12:00:00.000Z'), project: 'demo', server: 'playwright', sessionId: SESSION_ID }).subscribe((l) => (received = l));

    const request = http.expectOne((r) => r.url === '/api/v1/mcp-invocations');
    expect(request.request.params.get('since')).toBe('2026-09-18T12:00:00.000Z');
    expect(request.request.params.get('project')).toBe('demo');
    expect(request.request.params.get('server')).toBe('playwright');
    expect(request.request.params.get('session_id')).toBe(SESSION_ID);
    request.flush({
      items: [mcpInvocationDto()],
      servers: [mcpServerUsageDto()],
      unused_deferred: [{ session_id: SESSION_ID, tool_name: 'mcp__playwright__browser_resize', server: 'playwright', tool: 'browser_resize', loaded_at: '2026-09-25T10:00:00.000Z' }],
      facets: { projects: ['demo'], servers: ['playwright'] },
    });

    expect(received).toStrictEqual({
      items: [mcpInvocation()],
      servers: [mcpServerUsage()],
      unusedDeferred: [{ sessionId: SESSION_ID, toolName: 'mcp__playwright__browser_resize', server: 'playwright', tool: 'browser_resize', loadedAt: new Date('2026-09-25T10:00:00.000Z') }],
      projects: ['demo'],
      serverNames: ['playwright'],
    });
  });

  it('sin filtros solo envía `since`', () => {
    source.fetch({ since: new Date(0) }).subscribe();
    const request = http.expectOne((r) => r.url === '/api/v1/mcp-invocations');
    expect(request.request.params.keys()).toStrictEqual(['since']);
    request.flush({ items: [], servers: [], unused_deferred: [], facets: { projects: [], servers: [] } });
  });
});

describe('AC-43: etiquetas', () => {
  it.each([
    [null, '—'],
    [320, '320 B'],
    [4300, '4,2 KB'],
    [1_200_000, '1,1 MB'],
  ])('%s bytes se muestran como %s', (bytes, label) => expect(plain(formatBytes(bytes))).toBe(label));

  it.each([
    [null, '—'],
    [850, '850 ms'],
    [2500, '2,5 s'],
  ])('%s ms se muestran como %s', (ms, label) => expect(formatLatency(ms)).toBe(label));
});

describe('AC-44: reduceMcp', () => {
  it('ante un fallo conserva las últimas cifras conocidas', () => {
    const loaded = reduceMcp(INITIAL_MCP, { ok: true, list });
    expect(loaded).toMatchObject({ loaded: true, failed: false, serverNames: ['claude_ai_Claude_Docs', 'playwright'] });
    expect(reduceMcp(loaded, { ok: false })).toStrictEqual({ ...loaded, failed: true });
  });
});

describe('AC-43, AC-44: WatchMcpInvocations', () => {
  let live: Subject<ObservedEvent[]>;
  let fetch: ReturnType<typeof vi.fn<(filter: McpFilter) => Observable<McpInvocationList>>>;
  let states: McpState[];

  function start(query: McpQuery) {
    TestBed.configureTestingModule({
      providers: [
        { provide: McpSource, useValue: { fetch } },
        { provide: LiveEvents, useValue: { events$: live } },
      ],
    });
    states = [];
    TestBed.inject(WatchMcpInvocations)
      .execute(query)
      .subscribe((s) => states.push(s));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    live = new Subject<ObservedEvent[]>();
    fetch = vi.fn<(filter: McpFilter) => Observable<McpInvocationList>>().mockReturnValue(of(list));
  });

  afterEach(() => vi.useRealTimers());

  it('pide la ventana hacia atrás desde ahora con los filtros', () => {
    start({ windowMs: 7 * DAY, server: 'playwright' });
    expect(fetch).toHaveBeenCalledWith({ since: new Date(now.getTime() - 7 * DAY), project: undefined, server: 'playwright', sessionId: undefined });
    expect(states.at(-1)!.servers).toHaveLength(2);
  });

  it('vuelve a pedirlas con un Evento MCP, de ToolSearch o de fin de Turno, agrupando las ráfagas', async () => {
    start({ windowMs: DAY });
    live.next([observedEvent({ eventType: 'tool.pre', toolName: 'Bash' })]);
    await vi.advanceTimersByTimeAsync(MCP_REFRESH_DEBOUNCE_MS);
    expect(fetch).toHaveBeenCalledTimes(1);

    live.next([observedEvent({ eventType: 'tool.pre', toolName: 'mcp__playwright__browser_click' })]);
    live.next([observedEvent({ eventType: 'tool.post', toolName: 'ToolSearch' })]);
    await vi.advanceTimersByTimeAsync(MCP_REFRESH_DEBOUNCE_MS);
    expect(fetch).toHaveBeenCalledTimes(2);

    live.next([observedEvent({ eventType: 'turn.ended', toolName: null })]);
    await vi.advanceTimersByTimeAsync(MCP_REFRESH_DEBOUNCE_MS);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('para una Sesión solo reacciona a sus Eventos', async () => {
    start({ sessionId: SESSION_ID });
    live.next([observedEvent({ eventType: 'tool.pre', toolName: 'mcp__playwright__browser_click', sessionId: 'otra' })]);
    await vi.advanceTimersByTimeAsync(MCP_REFRESH_DEBOUNCE_MS);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('si la carga falla lo indica y sigue escuchando', async () => {
    fetch.mockReturnValueOnce(throwError(() => new Error('500')));
    start({});
    expect(states.at(-1)).toMatchObject({ loaded: true, failed: true });

    live.next([observedEvent({ eventType: 'tool.post', toolName: 'mcp__playwright__browser_click' })]);
    await vi.advanceTimersByTimeAsync(MCP_REFRESH_DEBOUNCE_MS);
    expect(states.at(-1)).toMatchObject({ failed: false });
  });
});

describe('AC-44: McpPage', () => {
  let state$: BehaviorSubject<McpState>;
  let queries: McpQuery[];

  async function render(url = '/mcp') {
    queries = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'mcp', component: McpPage }]),
        { provide: WatchMcpInvocations, useValue: { execute: (q: McpQuery) => (queries.push(q), state$) } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness;
  }

  const el = (harness: RouterTestingHarness) => harness.routeNativeElement!;
  const servers = (harness: RouterTestingHarness) => [...el(harness).querySelectorAll('[data-testid="mcp-server"]')];

  beforeEach(() => {
    state$ = new BehaviorSubject<McpState>({ ...INITIAL_MCP, invocations: list.items, servers: list.servers, projects: list.projects, serverNames: list.serverNames, loaded: true });
  });

  it('muestra una fila por servidor con su ámbito, fallos, latencia y tamaño', async () => {
    const harness = await render();
    const [playwright, docs] = servers(harness);

    expect(servers(harness)).toHaveLength(2);
    expect(text(playwright)).toContain('playwright');
    expect(text(playwright)).toContain('project');
    expect(plain(text(playwright))).toContain('33 %');
    expect(plain(text(playwright))).toContain('850 ms / 2,5 s');
    expect(plain(text(playwright))).toContain('2 KB / 117,2 KB');
    expect(text(playwright)).toContain('imagen');
    expect(text(docs)).not.toContain('imagen');
  });

  it('AC-120: pinta los Proyectos de cada servidor y "sin respuesta" con conteo y porcentaje', async () => {
    state$.next({
      ...state$.value,
      servers: [
        mcpServerUsage({ projects: ['demo', 'otro'], calls: 4, noResponse: 1 }),
        mcpServerUsage({ server: 'docs', projects: [], calls: 0, noResponse: 0, tools: [] }),
      ],
    });
    const harness = await render();
    const [first, second] = servers(harness);

    expect([...first!.querySelectorAll('[data-testid="mcp-projects"] .badge')].map((b) => text(b))).toStrictEqual(['demo', 'otro']);
    expect(text(first!.querySelector('[data-testid="mcp-no-response"]'))).toBe('1 (25 %)');
    expect(text(second!.querySelector('[data-testid="mcp-projects"]'))).toBe('—');
    expect(text(second!.querySelector('[data-testid="mcp-no-response"]'))).toBe('0 (—)');
  });

  it('AC-120: la fila de herramienta también muestra el porcentaje sin respuesta', async () => {
    state$.next({ ...state$.value, servers: [mcpServerUsage({ tools: [mcpToolUsage({ calls: 2, noResponse: 1 })] })] });
    const harness = await render();
    (servers(harness)[0]!.querySelector('button') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    expect(plain(text(el(harness).querySelector('[data-testid="mcp-tool"]')))).toContain('1 (50 %)');
  });

  it('por defecto pide 7 días y los filtros salen de la URL', async () => {
    const harness = await render();
    expect(queries).toStrictEqual([{ windowMs: 7 * DAY, project: undefined, server: undefined }]);

    await harness.navigateByUrl('/mcp?periodo=24h&servidor=playwright&proyecto=demo');
    expect(queries.at(-1)).toStrictEqual({ windowMs: DAY, project: 'demo', server: 'playwright' });
  });

  it('al desplegar un servidor muestra sus herramientas, que enlazan a sus Eventos', async () => {
    const harness = await render();
    (servers(harness)[0]!.querySelector('button') as HTMLButtonElement).click();
    await harness.fixture.whenStable();

    const tools = [...el(harness).querySelectorAll('[data-testid="mcp-tool"]')];
    expect(tools).toHaveLength(1);
    expect(tools[0]!.querySelector('a')!.getAttribute('href')).toBe('/eventos?herramienta=mcp__playwright__browser_navigate');
  });

  it('el selector de servidor escribe la URL', async () => {
    const harness = await render();
    const select = el(harness).querySelector('[data-testid="server-filter"] select') as HTMLSelectElement;
    select.value = 'playwright';
    select.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/mcp?servidor=playwright');
  });

  it('sin invocaciones explica de dónde salen', async () => {
    state$.next({ ...INITIAL_MCP, loaded: true });
    const harness = await render();
    expect(text(el(harness).querySelector('[data-testid="mcp-empty"]'))).toContain('Ninguna Herramienta MCP usada en este periodo');
  });

  it('avisa si no se pudieron cargar', async () => {
    state$.next({ ...INITIAL_MCP, loaded: true, failed: true });
    const harness = await render();
    expect(el(harness).querySelector('[data-testid="mcp-error"]')).not.toBeNull();
  });
});
