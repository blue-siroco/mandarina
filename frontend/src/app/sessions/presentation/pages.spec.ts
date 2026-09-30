import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';
import { observedEvent } from '../../events/testing/event-fixtures';
import { INITIAL_USAGE_STATE, WatchUsageMetrics } from '../../usage/application/watch-usage-metrics';
import { UsageQuery } from '../../usage/models/usage-metrics';
import { UsageSummary } from '../../usage/presentation/usage-summary/usage-summary';
import {
  INITIAL_SKILL_INVOCATIONS,
  SkillInvocationsState,
  WatchSkillInvocations,
} from '../../skills/application/watch-skill-invocations';
import { SkillInvocationQuery } from '../../skills/models/skill-invocation';
import { ToggleOptions } from '../../shared/lucia';
import { INITIAL_MCP, McpState, WatchMcpInvocations } from '../../mcp/application/watch-mcp-invocations';
import { McpQuery } from '../../mcp/models/mcp';
import { cache } from '../../usage/testing/usage-fixtures';
import { noBudgets } from '../../budgets/testing/budget-fixtures';
import { evaluationDto, evaluationList, stubEvaluationSource } from '../../evaluations/testing/evaluation-fixtures';
import { mcpInvocation, mcpServerUsage } from '../../mcp/testing/mcp-fixtures';
import { skillInvocation } from '../../skills/testing/skill-invocation-fixtures';
import { BoardFilter, BoardState, INITIAL_BOARD, WatchSessionBoard } from '../application/watch-session-board';
import { DetailState, INITIAL_DETAIL, WatchSessionDetail } from '../application/watch-session-detail';
import { SessionSummary } from '../models/session';
import { SESSION_ID, sessionDetail, sessionSummary } from '../testing/session-fixtures';
import { SessionBoard, stateSummary } from './session-board/session-board';
import { SessionDetailPage, tokenCards } from './session-detail/session-detail';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('AC-16: stateSummary', () => {
  it('lista solo los Estados con Sesiones', () => {
    expect(stateSummary({ active: 3, idle: 2, orphaned: 1, closed: 0 })).toBe('3 activas · 2 inactivas · 1 huérfana');
    expect(stateSummary({ active: 0, idle: 0, orphaned: 0, closed: 0 })).toBe('Sin Sesiones en este periodo');
  });
});

describe('AC-16: SessionBoard', () => {
  let state$: BehaviorSubject<BoardState>;
  let filters: BoardFilter[];

  const loaded = (items: SessionSummary[]): BoardState => ({
    list: { items, facets: { projects: [], directories: ['C:\\Codev\\demo'] } },
    loaded: true,
    failed: false,
  });

  let usageWindows: Array<number | undefined>;
  let usageQueries: Array<UsageQuery | undefined>;

  async function render(url = '/sesiones') {
    filters = [];
    usageWindows = [];
    usageQueries = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'sesiones', component: SessionBoard }]),
        { provide: WatchSessionBoard, useValue: { execute: (f: BoardFilter) => (filters.push(f), state$) } },
        {
          provide: WatchUsageMetrics,
          useValue: {
            execute: (w?: number, q?: UsageQuery) => (usageWindows.push(w), usageQueries.push(q), of(INITIAL_USAGE_STATE)),
          },
        },
        noBudgets,
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness;
  }

  const el = (harness: RouterTestingHarness) => harness.routeNativeElement!;
  const cards = (harness: RouterTestingHarness) => el(harness).querySelectorAll('[data-testid="session-card"]');

  const sessions = [
    sessionSummary({ sessionId: 'a1', state: 'active' }),
    sessionSummary({ sessionId: 'b1', state: 'idle', activity: 'paused', currentTool: null }),
    sessionSummary({ sessionId: 'c1', state: 'closed', activity: null }),
    sessionSummary({ sessionId: 'd1', project: 'lucia', state: 'orphaned', activity: null }),
  ];

  beforeEach(() => {
    state$ = new BehaviorSubject<BoardState>(INITIAL_BOARD);
  });

  it('muestra un esqueleto mientras carga', async () => {
    const harness = await render();
    expect(text(el(harness))).toContain('Cargando Sesiones');
  });

  it('agrupa por Proyecto con las Cerradas plegadas y resume todos los Estados', async () => {
    state$.next(loaded(sessions));
    const harness = await render();

    expect(text(el(harness).querySelector('[data-testid="state-summary"]'))).toBe(
      '1 activa · 1 inactiva · 1 huérfana · 1 cerrada',
    );
    expect(el(harness).querySelectorAll('[data-testid="project-group"]')).toHaveLength(2);
    expect(cards(harness)).toHaveLength(3);

    const showClosed = [...el(harness).querySelectorAll('button')].find((b) => text(b) === 'Mostrar 1 cerrada')!;
    showClosed.click();
    await harness.fixture.whenStable();
    expect(cards(harness)).toHaveLength(4);
  });

  it('plegar un Proyecto oculta sus tarjetas', async () => {
    state$.next(loaded(sessions));
    const harness = await render();
    const toggle = el(harness).querySelector('.project__toggle') as HTMLButtonElement;

    toggle.click();
    await harness.fixture.whenStable();

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(cards(harness)).toHaveLength(1);
  });

  it('filtra el Estado en el cliente sin cambiar el resumen', async () => {
    state$.next(loaded(sessions));
    const harness = await render('/sesiones?estado=idle');

    expect(cards(harness)).toHaveLength(1);
    expect(text(cards(harness)[0])).toContain('Inactiva');
    expect(text(el(harness).querySelector('[data-testid="state-summary"]'))).toContain('1 activa');
  });

  it('pasa el periodo y el Directorio de la URL al caso de uso', async () => {
    await render('/sesiones?rango=1h&directorio=C%3A%5CCodev%5Cdemo');
    expect(filters.at(-1)).toStrictEqual({ windowMs: 3_600_000, directory: 'C:\\Codev\\demo' });
  });

  it('por defecto muestra las últimas 24 h de todos los Directorios', async () => {
    await render();
    expect(filters.at(-1)).toStrictEqual({ windowMs: 24 * 3_600_000, directory: undefined });
  });

  it('AC-13: las fichas de uso siguen el periodo seleccionado', async () => {
    const harness = await render();
    const title = () => text(el(harness).querySelector('#usage-title'));
    expect(usageWindows.at(-1)).toBe(24 * 3_600_000);
    expect(title()).toBe('Últimas 24 h');

    await harness.navigateByUrl('/sesiones?rango=7d');
    expect(usageWindows.at(-1)).toBe(7 * 24 * 3_600_000);
    expect(title()).toBe('Últimos 7 días');

    await harness.navigateByUrl('/sesiones?rango=todo');
    expect(usageWindows.at(-1)).toBeUndefined();
    expect(title()).toBe('Todo el histórico');
  });

  it('AC-39: las fichas siguen el filtro de Directorio y un Directorio del desglose lo aplica', async () => {
    const harness = await render('/sesiones?directorio=C%3A%5CCodev%5Cdemo');
    expect(usageQueries.at(-1)).toStrictEqual({ directory: 'C:\\Codev\\demo' });

    const summary = harness.fixture.debugElement.query(By.directive(UsageSummary)).componentInstance as UsageSummary;
    summary.directorySelected.emit('C:\\Codev\\lucia');
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/sesiones?directorio=C:%5CCodev%5Clucia');
    expect(usageQueries.at(-1)).toStrictEqual({ directory: 'C:\\Codev\\lucia' });
  });

  it('distingue un periodo vacío de unos filtros sin coincidencias', async () => {
    state$.next(loaded([]));
    const harness = await render();
    expect(el(harness).querySelector('[data-testid="board-empty"]')).not.toBeNull();

    state$.next(loaded([sessionSummary({ state: 'active' })]));
    await harness.navigateByUrl('/sesiones?estado=closed');
    expect(el(harness).querySelector('[data-testid="board-no-matches"]')).not.toBeNull();
  });

  it('si falla un refresco avisa y conserva las tarjetas', async () => {
    state$.next({ ...loaded(sessions), failed: true });
    const harness = await render();
    expect(text(el(harness).querySelector('[data-testid="board-error"]'))).toContain('últimas Sesiones conocidas');
    expect(cards(harness)).toHaveLength(3);
  });
});

describe('AC-75: tokenCards con la eficiencia de la caché', () => {
  const cardWith = (overrides = {}) => tokenCards(sessionDetail().usage!, cache(overrides)).find((c) => c.key === 'cache')!;

  it('da la tasa de acierto y el ahorro neto', () => {
    const c = cardWith();
    expect(c.value).toMatch(/^95\s%$/);
    expect(c.detail).toMatch(/^Ahorro ~17,62\sUS\$$/);
    expect(c.accent).toBe('ok');
  });

  it('un ahorro neto negativo se llama Sobrecoste y pierde el acento verde', () => {
    const c = cardWith({ savings_net_usd: -0.3 });
    expect(c.detail).toMatch(/^Sobrecoste ~0,30\sUS\$$/);
    expect(c.accent).toBeUndefined();
  });

  it('sin tokens de entrada la tasa es un guion', () => {
    expect(cardWith({ hit_rate: null }).value).toBe('—');
  });
});

describe('AC-19: tokenCards', () => {
  it('calcula el % de caché y marca el coste desconocido', () => {
    const cards = tokenCards({ ...sessionDetail().usage!, estimatedCostUsd: null });
    expect(cards.map((c) => c.key)).toStrictEqual(['input', 'output', 'cache', 'requests', 'cost']);
    expect(cards[2]!.value).toMatch(/^95\s%$/);
    expect(cards[4]).toMatchObject({ value: '—', detail: 'Algún modelo no tiene Tarifa' });
  });
});

describe('AC-19, AC-31, AC-43: SessionDetailPage', () => {
  let state$: BehaviorSubject<DetailState>;
  let skills$: BehaviorSubject<SkillInvocationsState>;
  let mcp$: BehaviorSubject<McpState>;
  let ids: string[];
  let evaluations: ReturnType<typeof stubEvaluationSource>;
  let skillQueries: SkillInvocationQuery[];
  let mcpQueries: McpQuery[];

  async function render(url = `/sesiones/${SESSION_ID}`) {
    ids = [];
    skillQueries = [];
    mcpQueries = [];
    TestBed.configureTestingModule({
      providers: [
        // Como en app.config: el `:id` de la ruta llega al input del componente.
        provideRouter([{ path: 'sesiones/:id', component: SessionDetailPage }], withComponentInputBinding()),
        { provide: WatchSessionDetail, useValue: { execute: (id: string) => (ids.push(id), state$) } },
        { provide: WatchSkillInvocations, useValue: { execute: (q: SkillInvocationQuery) => (skillQueries.push(q), skills$) } },
        { provide: WatchMcpInvocations, useValue: { execute: (q: McpQuery) => (mcpQueries.push(q), mcp$) } },
        evaluations.provider,
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, SessionDetailPage);
    return harness;
  }

  const el = (harness: RouterTestingHarness) => harness.routeNativeElement!;
  const withData = (overrides: Partial<DetailState> = {}): DetailState => ({
    detail: sessionDetail(),
    events: [observedEvent({ id: 'e1' }), observedEvent({ id: 'e2' })],
    loaded: true,
    notFound: false,
    failed: false,
    ...overrides,
  });

  beforeEach(() => {
    state$ = new BehaviorSubject<DetailState>(INITIAL_DETAIL);
    skills$ = new BehaviorSubject<SkillInvocationsState>(INITIAL_SKILL_INVOCATIONS);
    mcp$ = new BehaviorSubject<McpState>(INITIAL_MCP);
    evaluations = stubEvaluationSource();
  });

  it('muestra la cabecera con Estado, duraciones y Turnos', async () => {
    state$.next(withData());
    const harness = await render();
    const header = text(el(harness).querySelector('.detail__header'));

    expect(text(el(harness).querySelector('h2'))).toBe('7f3c2a10');
    expect(header).toContain('Activa');
    expect(header).toContain('42 min Duración activa / 1 h 10 min Duración de reloj');
    expect(header).toContain('5 Turnos');
    expect(header).toContain('Trabajando… Bash · npm test');
  });

  it('AC-94: Esperando muestra el badge, el motivo completo y cuánto lleva esperando', async () => {
    const since = new Date(Date.now() - 10 * 60_000);
    state$.next(
      withData({
        detail: sessionDetail({
          activity: 'waiting',
          waiting: { since, reason: 'permission', tool: 'Bash', summary: 'npm run build', subagent: null },
        }),
      }),
    );
    const harness = await render();
    const header = el(harness).querySelector('.detail__header')!;

    expect(text(header.querySelector('[data-testid="waiting-badge"]'))).toBe('Esperando');
    expect(text(header.querySelector('[data-testid="waiting-reason"]'))).toBe('Pide permiso para Bash: npm run build');
    expect(text(header.querySelector('[data-testid="waiting-since"]'))).toMatch(/^desde hace \d+ min$/);
    expect(header.querySelector('[data-testid="working"]')).toBeNull();
  });

  it('el Resumen tiene contexto, herramientas, tokens, carriles y Eventos', async () => {
    state$.next(withData());
    const harness = await render();
    const panel = el(harness).querySelector('[data-testid="panel-resumen"]')!;

    expect(panel.querySelector('app-context-card')).not.toBeNull();
    expect(panel.querySelectorAll('[data-testid="tool-bar"]')).toHaveLength(2);
    expect(panel.querySelectorAll('[data-testid="token-cards"] .kpi')).toHaveLength(5);
    expect(panel.querySelector('[data-testid="activity-lanes"]')).not.toBeNull();
    expect(panel.querySelectorAll('[data-testid="event-row"]')).toHaveLength(2);
  });

  it('sin Transcript los tokens avisan y el resto sigue', async () => {
    state$.next(withData({ detail: sessionDetail({ usage: null, context: null, transcriptAvailable: false }) }));
    const harness = await render();
    expect(el(harness).querySelector('[data-testid="tokens-unavailable"]')).not.toBeNull();
    expect(el(harness).querySelectorAll('[data-testid="event-row"]')).toHaveLength(2);
  });

  it.each([
    ['prompts', '[data-testid="prompt"]', 2],
    ['linea', '[data-testid="turn"]', 2],
    ['subagentes', '[data-testid="subagent-row"]', 1],
    ['bloqueos', '[data-testid="session-block-row"]', 1],
  ])('la pestaña %s sale de la URL', async (tab, selector, count) => {
    state$.next(withData());
    const harness = await render(`/sesiones/${SESSION_ID}?pestana=${tab}`);
    expect(el(harness).querySelector(`[data-testid="panel-${tab}"]`)).not.toBeNull();
    expect(el(harness).querySelectorAll(selector)).toHaveLength(count);
  });

  it('los prompts muestran su texto completo', async () => {
    state$.next(withData());
    const harness = await render(`/sesiones/${SESSION_ID}?pestana=prompts`);
    expect(text(el(harness).querySelector('[data-testid="prompt"] .prompt__text'))).toBe('Añade un test');
  });

  it('una Sesión inexistente ofrece volver al board', async () => {
    state$.next({ ...INITIAL_DETAIL, loaded: true, notFound: true });
    const harness = await render('/sesiones/nope');
    const notFound = el(harness).querySelector('[data-testid="session-not-found"]');
    expect(text(notFound)).toContain('No existe la Sesión nope');
    expect(notFound?.querySelector('a')?.getAttribute('href')).toBe('/sesiones');
  });

  it('observa la Sesión del id de la ruta', async () => {
    await render();
    expect(ids).toStrictEqual([SESSION_ID]);
    expect(skillQueries).toStrictEqual([{ sessionId: SESSION_ID }]);
  });

  it('AC-36: ?subagente= abre ese Subagente desplegado en su pestaña', async () => {
    state$.next(withData());
    const key = sessionDetail().subagents[0]!.key;
    const harness = await render(`/sesiones/${SESSION_ID}?pestana=subagentes&subagente=${key}`);
    expect(el(harness).querySelectorAll('[data-testid="subagent-detail"]')).toHaveLength(1);
  });

  describe('AC-43: pestaña MCP', () => {
    const invocations = [
      mcpInvocation({ id: 'm3', tool: 'browser_take_screenshot', status: 'no_response', durationMs: null, responseBytes: null }),
      mcpInvocation({ id: 'm2', status: 'error', error: 'net::ERR_CONNECTION_REFUSED', subagentId: 'a1' }),
      mcpInvocation({ id: 'm1', hasImage: true, responseBytes: 120_000 }),
    ];
    const rows = (harness: RouterTestingHarness) => [...el(harness).querySelectorAll('[data-testid="mcp-invocation"]')];

    beforeEach(() => {
      state$.next(withData());
      mcp$.next({
        invocations,
        servers: [mcpServerUsage()],
        unusedDeferred: [{ sessionId: SESSION_ID, toolName: 'mcp__playwright__browser_resize', server: 'playwright', tool: 'browser_resize', loadedAt: new Date() }],
        projects: ['demo'],
        serverNames: ['playwright'],
        loaded: true,
        failed: false,
      });
    });

    it('observa las invocaciones MCP de la Sesión', async () => {
      await render();
      expect(mcpQueries).toStrictEqual([{ sessionId: SESSION_ID }]);
    });

    it('lista cada invocación con su estado en texto, latencia y tamaño, y las cargadas sin usar', async () => {
      const harness = await render(`/sesiones/${SESSION_ID}?pestana=mcp`);
      const [pending, failed, ok] = rows(harness);

      expect(text(pending)).toContain('Sin respuesta');
      expect(text(failed)).toContain('Error');
      expect(text(failed)).toContain('net::ERR_CONNECTION_REFUSED');
      expect(text(failed)).toContain('Subagente');
      expect(text(ok)).toContain('Bien');
      expect(text(ok)).toContain('117,2 KB');
      expect(text(ok)).toContain('imagen');
      expect(text(el(harness).querySelector('[data-testid="session-mcp-servers"]'))).toContain('playwright');
      expect(text(el(harness).querySelector('[data-testid="mcp-unused"]'))).toBe('playwright · browser_resize');
    });

    it('sin invocaciones explica de dónde salen', async () => {
      mcp$.next({ ...INITIAL_MCP, loaded: true });
      const harness = await render(`/sesiones/${SESSION_ID}?pestana=mcp`);
      expect(text(el(harness).querySelector('[data-testid="session-mcp-empty"]'))).toContain('mcp__');
    });
  });

  describe('pestaña Skills', () => {
    const invocations = [
      skillInvocation({ id: 'i3', skill: 'tdd', invoker: 'subagent', subagentId: 'a1', subagentType: 'e2e-builder', status: 'running', endedAt: null, durationMs: null, args: null }),
      skillInvocation({ id: 'i2', skill: 'nope', status: 'failed', error: 'Unknown skill: nope', endedAt: null, durationMs: null }),
      skillInvocation({ id: 'i1', skill: 'commit', invoker: 'user', turn: 1, args: null }),
    ];
    const rows = (harness: RouterTestingHarness) => [...el(harness).querySelectorAll('[data-testid="skill-invocation"]')];
    // Las pestañas son un `<lucia--togglebuttons>`: sus textos van en la propiedad, no en el DOM.
    const tabTexts = (harness: RouterTestingHarness) =>
      (el(harness).querySelector('[data-testid="detail-tabs"] lucia--togglebuttons') as unknown as { toogleOptions: ToggleOptions })
        .toogleOptions.options.map((o) => o.text);

    beforeEach(() => {
      state$.next(withData());
      skills$.next({ invocations, stats: [], projects: ['demo'], loaded: true, failed: false });
    });

    it('cuenta las invocaciones en la pestaña', async () => {
      const harness = await render();
      expect(tabTexts(harness)).toContain('Skills (3)');
    });

    it('lista cada invocación con quién la hizo, su estado con texto y su duración', async () => {
      const harness = await render(`/sesiones/${SESSION_ID}?pestana=skills`);
      const [subagent, failed, user] = rows(harness);

      expect(text(subagent)).toContain('tdd');
      expect(text(subagent)).toContain('e2e-builder');
      expect(text(subagent)).toContain('En curso');
      expect(text(failed)).toContain('Fallida');
      expect(text(failed)).toContain('Unknown skill: nope');
      expect(text(user)).toContain('Persona usuaria');
      expect(text(user)).toContain('Terminada');
      expect(text(user)).toContain('14 min');
      expect(user?.getAttribute('data-status')).toBe('finished');
    });

    it('enlaza cada invocación con su Turno en la Línea de tiempo, que lo resalta', async () => {
      const harness = await render(`/sesiones/${SESSION_ID}?pestana=skills`);
      const link = rows(harness)[2]!.querySelector('a')!;
      expect(link.getAttribute('href')).toBe(`/sesiones/${SESSION_ID}?pestana=linea&turno=1`);

      await harness.navigateByUrl(`/sesiones/${SESSION_ID}?pestana=linea&turno=1`);
      const turns = [...el(harness).querySelectorAll('[data-testid="turn"]')];
      expect(turns.map((t) => t.getAttribute('aria-current'))).toStrictEqual(['true', null]);
    });

    it('sin invocaciones explica de dónde salen', async () => {
      skills$.next({ ...INITIAL_SKILL_INVOCATIONS, loaded: true });
      const harness = await render(`/sesiones/${SESSION_ID}?pestana=skills`);
      expect(text(el(harness).querySelector('[data-testid="session-skills-empty"]'))).toContain('/nombre');
      expect(tabTexts(harness)).toContain('Skills');
    });
  });

  describe('AC-72, AC-75: caché en el detalle', () => {
    const rewrite = (overrides = {}) => ({
      messageId: 'm3',
      subagentId: null,
      occurredAt: new Date('2026-09-25T09:14:05.000Z'),
      model: 'claude-sonnet-5',
      cause: 'expired' as const,
      writtenTokens: 1_500_000,
      costUsd: 0.0025,
      gapMs: 540_000,
      ...overrides,
    });

    it('la ficha Caché de las fichas de tokens usa la eficiencia de la Sesión', async () => {
      state$.next(withData({ detail: sessionDetail({ cache: cache({ savings_net_usd: -0.3 }) }) }));
      const harness = await render();
      const card = el(harness).querySelector('[data-testid="token-cards"] [data-kpi="cache"]')!;
      expect(text(card.querySelector('.kpi__value'))).toMatch(/^95\s%$/);
      expect(text(card.querySelector('.kpi__detail'))).toMatch(/^Sobrecoste ~0,30\sUS\$$/);
    });

    it('las Reescrituras salen en la Línea de tiempo con su causa en texto, tokens, coste y Subagente', async () => {
      state$.next(
        withData({
          detail: sessionDetail({
            cacheRewrites: [rewrite(), rewrite({ messageId: 'h2', subagentId: 'a1', cause: 'model_change', costUsd: null, writtenTokens: 900 })],
          }),
        }),
      );
      const harness = await render(`/sesiones/${SESSION_ID}?pestana=linea`);
      const items = [...el(harness).querySelectorAll('[data-testid="cache-rewrite"]')];
      expect(items.map((i) => i.getAttribute('data-cause'))).toStrictEqual(['expired', 'model_change']);
      expect(text(items[0])).toMatch(/Caducada\s*1,5\sM tokens escritos\s*~0,00\sUS\$$/);
      expect(text(items[1])).toContain('Cambio de modelo');
      expect(text(items[1])).toContain('Sin Tarifa');
      expect(text(items[1])).toContain('Subagente');
      expect(items[0]!.textContent).not.toContain('Subagente');
    });

    it('sin Reescrituras no pinta nada', async () => {
      state$.next(withData());
      const harness = await render(`/sesiones/${SESSION_ID}?pestana=linea`);
      expect(el(harness).querySelector('[data-testid="cache-rewrites"]')).toBeNull();
    });
  });

  describe('AC-57: evaluar desde el detalle', () => {
    const scored = (objectType: 'session' | 'turn' | 'subagent', objectId: string, score: 1 | -1) =>
      evaluationDto({ object_type: objectType, object_id: objectId, session_id: SESSION_ID, score, tags: [], note: null });

    it('carga las Evaluaciones de la Sesión y pone los controles en la cabecera', async () => {
      evaluations = stubEvaluationSource({ list: () => of(evaluationList({ items: [scored('session', SESSION_ID, 1)], tags: [] })) });
      state$.next(withData());
      const harness = await render();
      await harness.fixture.whenStable();
      const controls = el(harness).querySelector('.detail__header [data-testid="session-evaluation"]')!;

      expect(controls.querySelector('[data-testid="score-up"]')!.getAttribute('aria-pressed')).toBe('true');
      expect(controls.querySelector('[data-testid="score-down"]')!.getAttribute('aria-pressed')).toBe('false');
      expect(controls.querySelector('[aria-label="Evaluación de la Sesión"]')).not.toBeNull();
    });

    it('pide las Evaluaciones de la Sesión una sola vez', async () => {
      state$.next(withData());
      await render();
      expect(evaluations.calls.list).toStrictEqual([{ sessionId: SESSION_ID }]);
    });

    it('cada Turno de la Línea de tiempo se puede evaluar por el id de su prompt', async () => {
      evaluations = stubEvaluationSource({ list: () => of(evaluationList({ items: [scored('turn', 'prompt-2', -1)], tags: [] })) });
      state$.next(withData());
      const harness = await render(`/sesiones/${SESSION_ID}?pestana=linea`);
      await harness.fixture.whenStable();
      const turns = [...el(harness).querySelectorAll('[data-testid="turn"]')];

      expect(turns.map((t) => t.querySelector('[data-testid="turn-evaluation"] [role="group"]')!.getAttribute('aria-label'))).toStrictEqual([
        'Evaluación del Turno 1',
        'Evaluación del Turno 2',
      ]);
      expect(turns.map((t) => t.querySelector('[data-testid="score-down"]')!.getAttribute('aria-pressed'))).toStrictEqual(['false', 'true']);
    });

    it('puntuar un Turno guarda su Evaluación sin recargar el detalle', async () => {
      state$.next(withData());
      const harness = await render(`/sesiones/${SESSION_ID}?pestana=linea`);
      const before = ids.length;
      (el(harness).querySelector('[data-testid="turn"] [data-testid="score-up"]') as HTMLButtonElement).click();
      await harness.fixture.whenStable();

      expect(evaluations.calls.put.map(([type, id, input]) => [type, id, input.score])).toStrictEqual([['turn', 'prompt-1', 1]]);
      expect(ids).toHaveLength(before);
    });
  });
});
