import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { INITIAL_USAGE_STATE, UsageState, WatchUsageMetrics } from '../../application/watch-usage-metrics';
import { UsageQuery } from '../../models/usage-metrics';
import { breakdown, cache, usageMetrics } from '../../testing/usage-fixtures';
import { KpiKey } from '../breakdown-columns';
import { BreakdownModal, VIEW_STORAGE_KEY } from './breakdown-modal';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
/** Las celdas no llevan espacios entre sí: se leen una a una. */
const cells = (row: Element | null | undefined) => [...(row?.children ?? [])].map((c) => text(c)).join(' ');

describe('AC-39, AC-40: BreakdownModal', () => {
  let state$: BehaviorSubject<UsageState>;
  let calls: Array<[number | undefined, UsageQuery | undefined]>;

  async function render(kpi: KpiKey = 'tools', inputs: Record<string, unknown> = {}) {
    calls = [];
    await TestBed.configureTestingModule({
      imports: [BreakdownModal],
      providers: [{ provide: WatchUsageMetrics, useValue: { execute: (w?: number, q?: UsageQuery) => (calls.push([w, q]), state$) } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(BreakdownModal);
    const values = { isOpen: true, kpi, label: 'Herramientas', periodTitle: 'Últimos 7 días', windowMs: 7 * 86_400_000, ...inputs };
    for (const [name, value] of Object.entries(values)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    return fixture;
  }

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const rows = (fixture: { nativeElement: unknown }) => [...el(fixture).querySelectorAll('[data-testid="breakdown-row"]')];
  const views = (fixture: { nativeElement: unknown }) =>
    el(fixture).querySelector('[data-testid="breakdown-views"] lucia--togglebuttons') as unknown as HTMLElement & {
      toogleOptions: { defaultSelectedOption: number };
    };
  const pickView = async (fixture: Awaited<ReturnType<typeof render>>, index: number) => {
    views(fixture).dispatchEvent(new CustomEvent('callback', { detail: { value: index } }));
    await fixture.whenStable();
  };

  beforeEach(() => {
    localStorage.clear();
    state$ = new BehaviorSubject<UsageState>({ metrics: usageMetrics({ breakdown: breakdown() }), loaded: true, failed: false });
  });

  it('pide el desglose del periodo y del Directorio del board, y lo rotula', async () => {
    const fixture = await render('tools', { directory: 'C:\\Codev\\demo' });
    expect(calls).toStrictEqual([[7 * 86_400_000, { directory: 'C:\\Codev\\demo', breakdown: true }]]);
    expect(text(el(fixture).querySelector('h2'))).toBe('Herramientas · Últimos 7 días');
    expect(text(el(fixture).querySelector('[data-testid="breakdown-filter"]'))).toBe('Solo …/Codev/demo');
  });

  it('cerrado no pide nada', async () => {
    await render('tools', { isOpen: false });
    expect(calls).toStrictEqual([]);
  });

  it('empieza por el total y sigue en orden descendente por la métrica de la ficha', async () => {
    const fixture = await render('tools');
    expect(cells(el(fixture).querySelector('[data-testid="breakdown-total"]'))).toBe('Total 150 12 2');
    expect(rows(fixture).map((r) => cells(r))).toStrictEqual(['…/Codev/demo demo 120 10 2', '…/Codev/lucia lucia 30 2 0']);
    expect(el(fixture).querySelector('th[aria-sort="descending"]')?.textContent).toContain('Herramientas');
  });

  it('AC-74: la ficha Caché reparte el ahorro neto, la tasa y las Reescrituras, ordenado por ahorro neto', async () => {
    const fixture = await render('cache', { label: 'Caché' });
    const plain = (value: string) => value.replace(/\s/g, ' ');
    expect(plain(cells(el(fixture).querySelector('[data-testid="breakdown-total"]')))).toBe(
      'Total ~17,62 US$ 95 % 4,7 M 200 mil 40 mil ~17,86 US$ ~0,24 US$ 3',
    );
    // demo ahorra más que lucia (que no tiene tokens): va primero.
    expect(rows(fixture).map((r) => plain(cells(r)).split(' ')[0])).toStrictEqual(['…/Codev/demo', '…/Codev/lucia']);
    expect(el(fixture).querySelector('th[aria-sort="descending"]')?.textContent).toContain('Ahorro neto');
  });

  it('AC-74: un ahorro neto negativo se ve como tal y se avisa de los modelos sin Tarifa', async () => {
    const negative = usageMetrics({
      breakdown: breakdown(),
      cache: cache({ savings_net_usd: -0.3, unpriced_models: ['mystery-model'] }),
    });
    state$.next({ metrics: negative, loaded: true, failed: false });
    const fixture = await render('cache', { label: 'Caché' });
    expect(text(el(fixture).querySelector('[data-testid="breakdown-total"] td'))).toMatch(/^~-0,30\sUS\$$/);
    expect(text(el(fixture).querySelector('[data-testid="breakdown-warning"]'))).toBe('Sin Tarifa, no suman importes: mystery-model');
  });

  it('reordena al pulsar una cabecera, primero descendente y luego ascendente', async () => {
    const fixture = await render('tools');
    const prompts = el(fixture).querySelector('[data-column="prompts"]') as HTMLButtonElement;
    prompts.click();
    await fixture.whenStable();
    expect(prompts.closest('th')?.getAttribute('aria-sort')).toBe('descending');

    prompts.click();
    await fixture.whenStable();
    expect(prompts.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    expect(text(rows(fixture)[0])).toContain('lucia');
  });

  it('por modelo muestra el badge y "Modelo desconocido", y recuerda la vista', async () => {
    const fixture = await render('tools');
    await pickView(fixture, 1);

    expect(el(fixture).querySelectorAll('[data-testid="breakdown-row"] app-model-badge')).toHaveLength(2);
    expect(rows(fixture).map((r) => text(r)).filter((t) => t.includes('Modelo desconocido'))).toHaveLength(1);
    expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe('model');

    TestBed.resetTestingModule();
    const reopened = await render('tools');
    expect(views(reopened).toogleOptions.defaultSelectedOption).toBe(1);
  });

  it('en el coste por modelo muestra la Tarifa y el desglose, y avisa de lo que falta', async () => {
    state$.next({
      metrics: usageMetrics({ breakdown: breakdown(), unpricedModels: ['modelo-raro'], transcripts: { read: 5, unavailable: 1 } }),
      loaded: true,
      failed: false,
    });
    const fixture = await render('cost', { label: 'Coste estimado' });
    await pickView(fixture, 1);

    expect(text(rows(fixture)[0])).toContain('4 / 20');
    expect(text(rows(fixture)[0])).toContain('~1,50 US$');
    const warnings = [...el(fixture).querySelectorAll('[data-testid="breakdown-warning"]')].map((w) => text(w));
    expect(warnings).toStrictEqual(['Sin Tarifa, no suman coste: modelo-raro', '1 Transcript no disponible: su coste no se conoce']);
  });

  it('pulsar un Directorio lo elige y cierra el modal', async () => {
    const fixture = await render('tools');
    const selected: string[] = [];
    let closed = 0;
    fixture.componentInstance.directorySelected.subscribe((d) => selected.push(d));
    fixture.componentInstance.closed.subscribe(() => closed++);

    (rows(fixture)[1]!.querySelector('button') as HTMLButtonElement).click();

    expect(selected).toStrictEqual(['C:\\Codev\\lucia']);
    expect(closed).toBe(1);
  });

  it('se cierra con Esc, con el botón de cerrar y pulsando fuera, pero no pulsando dentro', async () => {
    const fixture = await render('tools');
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);

    // El foco está en la ventana: `Esc` sube hasta la capa.
    el(fixture).querySelector('[data-testid="breakdown-modal"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    el(fixture).querySelector('[data-testid="breakdown-close"] lucia--button')!.dispatchEvent(new CustomEvent('callback', { detail: 'click' }));
    (el(fixture).querySelector('[data-testid="breakdown-overlay"]') as HTMLElement).click();
    (el(fixture).querySelector('[data-testid="breakdown-modal"]') as HTMLElement).click();

    expect(closed).toBe(3);
  });

  it('si falla un refresco avisa y conserva las cifras', async () => {
    state$.next({ metrics: usageMetrics({ breakdown: breakdown() }), loaded: true, failed: true });
    const fixture = await render('tools');
    expect(el(fixture).querySelector('[data-testid="breakdown-error"]')).not.toBeNull();
    expect(rows(fixture)).toHaveLength(2);
  });

  it('mientras carga lo dice', async () => {
    state$.next(INITIAL_USAGE_STATE);
    const fixture = await render('tools');
    expect(text(el(fixture))).toContain('Cargando el desglose');
  });
});
