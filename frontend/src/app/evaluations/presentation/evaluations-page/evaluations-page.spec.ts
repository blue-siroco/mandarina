import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';
import { EvaluationsQuery, EvaluationsState, INITIAL_EVALUATIONS, WatchEvaluations } from '../../application/watch-evaluations';
import { evaluation, evaluationList } from '../../testing/evaluation-fixtures';
import { EvaluationsPage, objectLink } from './evaluations-page';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const HOUR = 3_600_000;

describe('AC-58: objectLink', () => {
  it('una Sesión lleva a su detalle, un Turno a su Línea de tiempo y un Subagente a su pestaña con él desplegado', () => {
    expect(objectLink(evaluation({ object_type: 'session', session_id: 's9' }))).toStrictEqual({ link: ['/sesiones', 's9'], queryParams: null });
    expect(objectLink(evaluation({ object_type: 'turn', session_id: 's9', object_id: 'p1' }))).toStrictEqual({
      link: ['/sesiones', 's9'],
      queryParams: { pestana: 'linea' },
    });
    expect(objectLink(evaluation({ object_type: 'subagent', session_id: 's9', object_id: 'agent-a1' }))).toStrictEqual({
      link: ['/sesiones', 's9'],
      queryParams: { pestana: 'subagentes', subagente: 'agent-a1' },
    });
  });
});

describe('AC-58: EvaluationsPage', () => {
  let state$: BehaviorSubject<EvaluationsState>;
  let queries: EvaluationsQuery[];
  let exported: EvaluationsQuery[];

  const loaded = (): EvaluationsState => {
    const list = evaluationList();
    return { items: list.items, tags: list.tags, projects: list.projects, loaded: true, failed: false };
  };

  async function render(url = '/evaluaciones') {
    queries = [];
    exported = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'evaluaciones', component: EvaluationsPage },
          { path: 'sesiones/:id', component: EvaluationsPage },
        ]),
        {
          provide: WatchEvaluations,
          useValue: {
            execute: (q: EvaluationsQuery) => (queries.push(q), state$),
            exportUrl: (q: EvaluationsQuery) => (exported.push(q), `/api/v1/evaluations/export?q=${JSON.stringify(q)}`),
          },
        },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness;
  }

  const el = (h: RouterTestingHarness) => h.routeNativeElement!;
  const rows = (h: RouterTestingHarness) => [...el(h).querySelectorAll('[data-testid="evaluation-row"]')];
  const select = async (h: RouterTestingHarness, testId: string, value: string) => {
    const field = el(h).querySelector<HTMLSelectElement>(`[data-testid="${testId}"] select`)!;
    field.value = value;
    field.dispatchEvent(new Event('change'));
    await h.fixture.whenStable();
  };

  beforeEach(() => {
    state$ = new BehaviorSubject<EvaluationsState>(loaded());
  });

  it('pide todo el histórico por defecto', async () => {
    await render();
    expect(queries).toStrictEqual([{ windowMs: undefined, objectTypes: undefined, score: undefined, tag: undefined, project: undefined }]);
  });

  it('lista cada Evaluación con su objeto, Proyecto, Puntuación, Etiquetas y Nota', async () => {
    const harness = await render();
    const parts = (row: Element | undefined) => ({
      type: row?.getAttribute('data-type'),
      object: text(row?.querySelector('.object__type')),
      summary: row?.querySelector('.object__summary') ? text(row.querySelector('.object__summary')) : null,
      score: text(row?.querySelector('.score')),
      tags: [...(row?.querySelectorAll('.tag') ?? [])].map(text),
      note: text(row?.querySelector('.note')),
    });
    const [turn, subagent, session] = rows(harness).map(parts);
    expect(turn).toStrictEqual({ type: 'turn', object: 'Turno', summary: 'arregla el test', score: 'Mal', tags: ['hallucination', 'bug-fix'], note: '—' });
    expect(subagent).toStrictEqual({ type: 'subagent', object: 'Subagente · Explore', summary: 'buscar el test', score: 'Bien', tags: [], note: 'Lo encontró' });
    expect(session).toStrictEqual({ type: 'session', object: 'Sesión', summary: null, score: 'Bien', tags: ['bug-fix'], note: 'Bien' });
  });

  it('cada fila enlaza a su objeto en el detalle de Sesión', async () => {
    const harness = await render();
    const hrefs = rows(harness).map((r) => r.querySelector('a')?.getAttribute('href'));
    expect(hrefs).toStrictEqual(['/sesiones/s1?pestana=linea', '/sesiones/s1?pestana=subagentes&subagente=agent-a1', '/sesiones/s1']);
  });

  it('los filtros llegan de la URL y se reflejan en la petición', async () => {
    await render('/evaluaciones?periodo=7d&tipo=turn&puntuacion=down&etiqueta=bug-fix&proyecto=demo');
    expect(queries.at(-1)).toStrictEqual({ windowMs: 7 * 24 * HOUR, objectTypes: ['turn'], score: 'down', tag: 'bug-fix', project: 'demo' });
  });

  it('un valor inválido en la URL se ignora', async () => {
    await render('/evaluaciones?periodo=siempre&tipo=cosa&puntuacion=quiza');
    expect(queries.at(-1)).toStrictEqual({ windowMs: undefined, objectTypes: undefined, score: undefined, tag: undefined, project: undefined });
  });

  it('elegir un filtro lo refleja en la URL y quitarlo la limpia', async () => {
    const harness = await render();
    const router = TestBed.inject(Router);
    await select(harness, 'type-filter', 'Subagente');
    expect(router.url).toBe('/evaluaciones?tipo=subagent');
    await select(harness, 'score-filter', '+1 (bien)');
    expect(router.url).toBe('/evaluaciones?tipo=subagent&puntuacion=up');
    await select(harness, 'project-filter', 'lucia');
    expect(router.url).toContain('proyecto=lucia');
    await select(harness, 'type-filter', '');
    expect(router.url).not.toContain('tipo=');
  });

  it('el periodo se elige con botones y "Todo" no ensucia la URL', async () => {
    const harness = await render();
    const router = TestBed.inject(Router);
    el(harness).querySelector('[data-testid="range-filter"] lucia--togglebuttons')!.dispatchEvent(new CustomEvent('callback', { detail: { value: 3 } }));
    await harness.fixture.whenStable();
    expect(router.url).toBe('/evaluaciones?periodo=30d');
    el(harness).querySelector('[data-testid="range-filter"] lucia--togglebuttons')!.dispatchEvent(new CustomEvent('callback', { detail: { value: 4 } }));
    await harness.fixture.whenStable();
    expect(router.url).toBe('/evaluaciones');
  });

  it('el filtro de Etiqueta ofrece las Etiquetas de la lista', async () => {
    const harness = await render();
    const options = [...el(harness).querySelectorAll('[data-testid="tag-filter"] option')].map((o) => (o as HTMLOptionElement).value);
    expect(options).toStrictEqual(['', 'bug-fix', 'hallucination']);
  });

  it('cuenta el uso de cada Etiqueta y al pulsarla la aplica como filtro; pulsarla otra vez la quita', async () => {
    const harness = await render();
    const router = TestBed.inject(Router);
    const counts = () => [...el(harness).querySelectorAll('[data-testid="tag-counts"] button')];
    expect(counts().map((b) => [...b.children].map(text))).toStrictEqual([['bug-fix', '2'], ['hallucination', '1']]);
    counts()[1]!.click();
    await harness.fixture.whenStable();
    expect(router.url).toBe('/evaluaciones?etiqueta=hallucination');
    expect(counts()[1]!.getAttribute('aria-pressed')).toBe('true');
    counts()[1]!.click();
    await harness.fixture.whenStable();
    expect(router.url).toBe('/evaluaciones');
  });

  it('el botón Exportar dataset descarga el JSONL con los filtros vigentes', async () => {
    const harness = await render('/evaluaciones?tipo=turn&puntuacion=up');
    const link = el(harness).querySelector<HTMLAnchorElement>('[data-testid="export-dataset"]')!;
    expect(text(link)).toBe('Exportar dataset');
    expect(link.getAttribute('download')).toBe('evaluaciones.jsonl');
    expect(link.getAttribute('href')).toContain('/api/v1/evaluations/export');
    expect(exported.at(-1)).toMatchObject({ objectTypes: ['turn'], score: 'up' });
  });

  it('sin Evaluaciones explica dónde se crean', async () => {
    state$.next({ ...INITIAL_EVALUATIONS, loaded: true });
    const harness = await render();
    expect(el(harness).querySelector('[data-testid="evaluations-table"]')).toBeNull();
    expect(text(el(harness).querySelector('[data-testid="evaluations-empty"]'))).toContain('desde el detalle de una Sesión');
  });

  it('mientras carga muestra un esqueleto accesible', async () => {
    state$.next(INITIAL_EVALUATIONS);
    const harness = await render();
    expect(el(harness).querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(el(harness).querySelector('[data-testid="evaluations-empty"]')).toBeNull();
  });

  it('un fallo de carga se avisa sin romper la pantalla y conserva la última lista', async () => {
    state$.next({ ...loaded(), failed: true });
    const harness = await render();
    expect(el(harness).querySelector('[data-testid="evaluations-error"]')?.getAttribute('role')).toBe('alert');
    expect(rows(harness)).toHaveLength(3);
  });
});
