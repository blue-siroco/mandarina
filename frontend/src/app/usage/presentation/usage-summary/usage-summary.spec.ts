import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { WatchBudgets } from '../../../budgets/application/watch-budgets';
import { budget, budgetSubjectDto, noBudgets } from '../../../budgets/testing/budget-fixtures';
import { INITIAL_USAGE_STATE, UsageState, WatchUsageMetrics } from '../../application/watch-usage-metrics';
import { UsageQuery } from '../../models/usage-metrics';
import { breakdown, cache, usageMetrics } from '../../testing/usage-fixtures';
import { UsageSummary, toKpiCards } from './usage-summary';

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('AC-13: toKpiCards', () => {
  const card = (key: string, metrics = usageMetrics()) => toKpiCards(metrics).find((c) => c.key === key);

  it('pinta las fichas en orden', () => {
    expect(toKpiCards(usageMetrics()).map((c) => c.key)).toStrictEqual([
      'working',
      'paused',
      'input',
      'output',
      'cache',
      'cost',
      'tools',
    ]);
  });

  it('muestra Sesiones Trabajando con sus Subagentes en marcha, y En pausa con las Huérfanas', () => {
    expect(card('working')).toMatchObject({ value: '2', detail: '3 Subagentes en marcha' });
    expect(card('paused')).toMatchObject({ value: '1', detail: '1 Huérfana' });
  });

  it('resume los tokens en formato compacto y el % de lectura de caché', () => {
    // entrada total = 1200 + 4,7 M + 240 mil
    expect(card('input')?.value).toMatch(/^4,9\sM$/);
    expect(card('input')?.detail).toMatch(/^95\s% leído de caché · 240\smil escritos$/);
    expect(card('output')).toMatchObject({ detail: 'Sobre todo claude-opus-5-5' });
    expect(card('output')?.value).toMatch(/^45\smil$/);
  });

  it('sin tokens no divide por cero', () => {
    const empty = usageMetrics({ tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }, byModel: [] });
    expect(card('input', empty)?.detail).toMatch(/^Sin caché · 0\sescritos$/);
    expect(card('output', empty)?.detail).toBe('Sin respuestas del modelo');
  });

  it('marca el coste como estimado y avisa de modelos sin Tarifa o Transcripts perdidos', () => {
    expect(card('cost')?.value).toMatch(/^~3,42\sUS\$$/);
    expect(card('cost')?.accent).toBe('brand');
    expect(card('cost', usageMetrics({ unpricedModels: ['gpt-5'] }))?.detail).toBe('Sin Tarifa: gpt-5');
    expect(card('cost', usageMetrics({ transcripts: { read: 4, unavailable: 2 } }))?.detail).toBe(
      '2 Transcripts no disponibles',
    );
  });

  it('AC-74: la ficha Caché da la tasa de acierto, el ahorro neto y las Reescrituras', () => {
    const c = card('cache')!;
    expect(c.label).toBe('Caché');
    expect(c.value).toMatch(/^95\s%$/);
    expect(c.detail).toMatch(/^Ahorro ~17,62\sUS\$ · 3 Reescrituras$/);
    expect(c.tone).toBeUndefined();
  });

  it('AC-74: con un ahorro neto negativo dice Sobrecoste, con esa palabra y en rojo', () => {
    const c = card('cache', usageMetrics({ cache: cache({ savings_net_usd: -0.3, rewrites: 1 }) }))!;
    expect(c.detail).toMatch(/^Sobrecoste ~0,30\sUS\$ · 1 Reescritura$/);
    expect(c.tone).toBe('danger');
  });

  it('AC-74: sin Reescrituras no las nombra, y sin tasa ni datos muestra un guion', () => {
    expect(card('cache', usageMetrics({ cache: cache({ rewrites: 0 }) }))?.detail).toMatch(/^Ahorro ~17,62\sUS\$$/);
    expect(card('cache', usageMetrics({ cache: cache({ hit_rate: null }) }))?.value).toBe('—');
    expect(card('cache', usageMetrics({ cache: null }))).toMatchObject({ value: '—', detail: 'Sin datos' });
  });

  it('cuenta herramientas, prompts y Bloqueos del día', () => {
    expect(card('tools')).toMatchObject({ value: '150', detail: '12 prompts · 2 Bloqueos' });
  });
});

describe('AC-13, AC-39: UsageSummary', () => {
  let state$: BehaviorSubject<UsageState>;
  let windows: Array<number | undefined>;

  async function render(inputs: { windowMs?: number; title?: string } = {}) {
    await TestBed.configureTestingModule({
      imports: [UsageSummary],
      providers: [
        { provide: WatchUsageMetrics, useValue: { execute: (w?: number) => (windows.push(w), state$) } },
        noBudgets,
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(UsageSummary);
    fixture.componentRef.setInput('windowMs', inputs.windowMs);
    fixture.componentRef.setInput('title', inputs.title ?? 'Últimas 24 h');
    await fixture.whenStable();
    return fixture;
  }

  beforeEach(() => {
    state$ = new BehaviorSubject<UsageState>(INITIAL_USAGE_STATE);
    windows = [];
  });

  it('pide las métricas del periodo recibido y lo rotula', async () => {
    const fixture = await render({ windowMs: 3_600_000, title: 'Última hora' });

    expect(windows).toStrictEqual([3_600_000]);
    expect(text((fixture.nativeElement as HTMLElement).querySelector('#usage-title'))).toBe('Última hora');
  });

  it('al cambiar de periodo vuelve a pedirlas con la nueva ventana', async () => {
    const fixture = await render({ windowMs: 3_600_000, title: 'Última hora' });

    fixture.componentRef.setInput('windowMs', undefined);
    fixture.componentRef.setInput('title', 'Todo el histórico');
    await fixture.whenStable();

    expect(windows).toStrictEqual([3_600_000, undefined]);
    expect(text((fixture.nativeElement as HTMLElement).querySelector('#usage-title'))).toBe('Todo el histórico');
  });

  it('muestra un esqueleto mientras carga', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    expect(text(el)).toContain('Cargando métricas');
    expect(el.querySelectorAll('[data-testid="usage-card"]')).toHaveLength(0);
  });

  it('pinta una ficha por métrica con etiqueta, cifra y detalle', async () => {
    state$.next({ metrics: usageMetrics(), loaded: true, failed: false });
    const fixture = await render();
    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="usage-card"]');

    expect(cards).toHaveLength(7);
    const first = cards[0] as HTMLElement;
    expect(text(first.querySelector('h3'))).toBe('Trabajando');
    expect(text(first.querySelector('.kpi__value'))).toBe('2');
    expect(text(first.querySelector('.kpi__detail'))).toBe('3 Subagentes en marcha');
    expect((cards[5] as HTMLElement).dataset['accent']).toBe('brand');
  });

  it('se actualiza sola cuando llegan cifras nuevas', async () => {
    state$.next({ metrics: usageMetrics(), loaded: true, failed: false });
    const fixture = await render();

    state$.next({
      metrics: usageMetrics({ sessions: { total: 9, working: 5, paused: 1, orphaned: 0, closed: 3 } }),
      loaded: true,
      failed: false,
    });
    await fixture.whenStable();

    const working = (fixture.nativeElement as HTMLElement).querySelector('[data-kpi="working"]');
    expect(text(working)).toContain('5');
  });

  it('si falla un refresco avisa sin ocultar las últimas cifras', async () => {
    state$.next({ metrics: usageMetrics(), loaded: true, failed: true });
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;

    expect(text(el.querySelector('[data-testid="usage-error"]'))).toContain('últimas conocidas');
    expect(el.querySelectorAll('[data-testid="usage-card"]')).toHaveLength(7);
  });

  it('si falla la primera carga lo dice', async () => {
    state$.next({ metrics: null, loaded: true, failed: true });
    const fixture = await render();
    expect(text((fixture.nativeElement as HTMLElement).querySelector('[data-testid="usage-error"]'))).toContain(
      'No se pudieron cargar',
    );
  });
});

describe('AC-39: fichas que abren su desglose', () => {
  let state$: BehaviorSubject<UsageState>;
  let calls: Array<[number | undefined, UsageQuery | undefined]>;

  async function render(directory: string | null = null) {
    calls = [];
    await TestBed.configureTestingModule({
      imports: [UsageSummary],
      providers: [{ provide: WatchUsageMetrics, useValue: { execute: (w?: number, q?: UsageQuery) => (calls.push([w, q]), state$) } }, noBudgets],
    }).compileComponents();
    const fixture = TestBed.createComponent(UsageSummary);
    fixture.componentRef.setInput('windowMs', 3_600_000);
    fixture.componentRef.setInput('title', 'Última hora');
    fixture.componentRef.setInput('directory', directory);
    await fixture.whenStable();
    return fixture;
  }

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const card = (fixture: { nativeElement: unknown }, key: string) => el(fixture).querySelector(`[data-kpi="${key}"]`) as HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    state$ = new BehaviorSubject<UsageState>({ metrics: usageMetrics({ breakdown: breakdown() }), loaded: true, failed: false });
  });

  it('las fichas siguen el filtro de Directorio del board', async () => {
    await render('C:\\Codev\\demo');
    expect(calls).toStrictEqual([[3_600_000, { directory: 'C:\\Codev\\demo' }]]);
  });

  it('pulsar una ficha abre su desglose, con el desglose pedido al abrir', async () => {
    const fixture = await render();
    expect(el(fixture).querySelector('[data-testid="breakdown-modal"]')).toBeNull();

    card(fixture, 'cost').click();
    await fixture.whenStable();

    expect(text(el(fixture).querySelector('#breakdown-title'))).toBe('Coste estimado · Última hora');
    expect(calls.at(-1)).toStrictEqual([3_600_000, { directory: undefined, breakdown: true }]);
  });

  it('se abre también con Enter o Espacio', async () => {
    const fixture = await render();
    const tools = card(fixture, 'tools');
    expect(tools.getAttribute('role')).toBe('button');
    expect(tools.getAttribute('tabindex')).toBe('0');

    tools.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(text(el(fixture).querySelector('#breakdown-title'))).toBe('Herramientas · Última hora');

    el(fixture).querySelector('[data-testid="breakdown-modal"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    card(fixture, 'input').dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    await fixture.whenStable();
    expect(text(el(fixture).querySelector('#breakdown-title'))).toBe('Tokens de entrada · Última hora');
  });

  it('al cerrar devuelve el foco a la ficha', async () => {
    const fixture = await render();
    card(fixture, 'paused').click();
    await fixture.whenStable();

    el(fixture).querySelector('[data-testid="breakdown-modal"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    await Promise.resolve();

    expect(el(fixture).querySelector('[data-testid="breakdown-modal"]')).toBeNull();
    expect(document.activeElement).toBe(card(fixture, 'paused'));
  });

  it('elegir un Directorio en el desglose avisa al board', async () => {
    const fixture = await render();
    const selected: string[] = [];
    fixture.componentInstance.directorySelected.subscribe((d) => selected.push(d));
    card(fixture, 'working').click();
    await fixture.whenStable();

    (el(fixture).querySelector('[data-testid="breakdown-row"] button') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(selected).toStrictEqual(['C:\\Codev\\demo']);
    expect(el(fixture).querySelector('[data-testid="breakdown-modal"]')).toBeNull();
  });
});

describe('AC-84: la ficha de Coste estimado y el Presupuesto global del día', () => {
  async function render(items: ReturnType<typeof budget>[], windowMs?: number) {
    await TestBed.configureTestingModule({
      imports: [UsageSummary],
      providers: [
        { provide: WatchUsageMetrics, useValue: { execute: () => new BehaviorSubject<UsageState>({ metrics: usageMetrics(), loaded: true, failed: false }) } },
        { provide: WatchBudgets, useValue: { state$: of({ items, loaded: true, failed: false }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(UsageSummary);
    fixture.componentRef.setInput('windowMs', windowMs);
    fixture.componentRef.setInput('title', 'Últimas 24 h');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }
  const costCard = (el: HTMLElement) => el.querySelector('[data-kpi="cost"]')!;

  it('muestra lo gastado hoy frente al límite, el porcentaje y el estado en texto', async () => {
    const el = await render([budget({ limit_usd: 50, subjects: [budgetSubjectDto({ spent_usd: 12, ratio: 0.24 })] })]);
    const day = costCard(el).querySelector('[data-testid="day-budget"]')!;
    expect(text(day.querySelector('[data-testid="day-budget-label"]'))).toMatch(/^Hoy: ~.*12.* de ~.*50/);
    expect(text(day.querySelector('[data-testid="day-budget-percent"]'))).toMatch(/^24s?%$/);
    expect(text(day.querySelector('[data-testid="day-budget-state"]'))).toBe('Dentro');
    expect(day.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('24');
    expect(day.getAttribute('data-state')).toBe('within');
  });

  it('un Presupuesto superado se ve como tal y la barra no pasa del 100 %', async () => {
    const el = await render([budget({ limit_usd: 50, state: 'exceeded', subjects: [budgetSubjectDto({ spent_usd: 62, ratio: 1.24, state: 'exceeded' })] })]);
    const day = costCard(el).querySelector('[data-testid="day-budget"]')!;
    expect(text(day.querySelector('[data-testid="day-budget-state"]'))).toBe('Superado');
    expect(text(day.querySelector('[data-testid="day-budget-percent"]'))).toMatch(/^124s?%$/);
    expect(day.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('100');
  });

  it('no depende del periodo del board: el mismo progreso con 1 h y con todo', async () => {
    const items = [budget({ subjects: [budgetSubjectDto({ spent_usd: 12, ratio: 0.24 })] })];
    const hour = text((await render(items, 3_600_000)).querySelector('[data-testid="day-budget-label"]'));
    TestBed.resetTestingModule();
    const all = text((await render(items, undefined)).querySelector('[data-testid="day-budget-label"]'));
    expect(hour).toBe(all);
  });

  it('solo cuentan los globales del día activos y solo salen en la ficha de coste', async () => {
    const off = { ...budget(), enabled: false };
    const perProject = budget({ scope: 'project_day', project: 'demo' });
    const el = await render([off, perProject]);
    expect(el.querySelector('[data-testid="day-budget"]')).toBeNull();

    TestBed.resetTestingModule();
    const other = await render([budget()]);
    expect(other.querySelectorAll('[data-testid="day-budget"]')).toHaveLength(1);
    expect(other.querySelector('[data-kpi="tools"] [data-testid="day-budget"]')).toBeNull();
  });
});
