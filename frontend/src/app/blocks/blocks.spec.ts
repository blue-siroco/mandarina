import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';
import { LiveEvents } from '../events/application/live-events';
import { EventQuery, ObservedEvent } from '../events/models/observed-event';
import { EventFeed } from '../events/ports/event-feed';
import { observedEvent } from '../events/testing/event-fixtures';
import { blockStats, ruleColor } from './application/block-stats';
import { BlocksState, INITIAL_BLOCKS, WatchBlocks, windowStart } from './application/watch-blocks';
import { BlocksPage } from './presentation/blocks-page/blocks-page';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

// Fechas locales: los días del gráfico son los del navegador.
const now = new Date(2026, 8, 25, 18, 0);
const day = (offset: number, hour = 12) => new Date(2026, 8, 25 + offset, hour);

function blocked(id: string, rule: string, occurredAt: Date, sessionId = 's1'): ObservedEvent {
  return observedEvent({
    id,
    sessionId,
    eventType: 'tool.blocked',
    occurredAt,
    receivedAt: occurredAt,
    payload: { tool_input: { command: 'rm -rf /' } },
    block: { rule, reason: `Motivo de ${rule}` },
  });
}

const blocks = [
  blocked('a', 'dangerous-rm', day(0, 10)),
  blocked('b', 'dangerous-rm', day(-1), 's2'),
  blocked('c', 'sensitive-file', day(-6), 's2'),
  blocked('old', 'sensitive-file', day(-7)),
];

describe('AC-22: blockStats', () => {
  const stats = blockStats(blocks, now);

  it('cuenta hoy, 7 días (con hoy) y Sesiones afectadas', () => {
    expect(stats).toMatchObject({ today: 1, week: 3, sessions: 2 });
  });

  it('ordena las Reglas por frecuencia y destaca la más disparada', () => {
    expect(stats.rules).toStrictEqual(['dangerous-rm', 'sensitive-file']);
    expect(stats.topRule).toStrictEqual({ rule: 'dangerous-rm', count: 2 });
  });

  it('apila por día y Regla, incluidos los días sin Bloqueos', () => {
    expect(stats.days).toHaveLength(7);
    expect(stats.days.map((d) => d.total)).toStrictEqual([1, 0, 0, 0, 0, 1, 1]);
    expect(stats.days[0]!.counts).toStrictEqual([0, 1]);
    expect(stats.days[6]!.counts).toStrictEqual([1, 0]);
  });

  it('sin Bloqueos no hay Regla destacada', () => {
    expect(blockStats([], now)).toMatchObject({ today: 0, week: 0, topRule: null, rules: [] });
  });

  it('asigna colores de serie estables por posición', () => {
    expect(ruleColor(0)).toBe('var(--series-1)');
    expect(ruleColor(9)).toBe('var(--series-other)');
  });
});

describe('AC-22: WatchBlocks', () => {
  let live: Subject<ObservedEvent[]>;
  let queries: EventQuery[];
  let history: () => Observable<ObservedEvent[]>;
  let states: BlocksState[];

  function start() {
    TestBed.configureTestingModule({
      providers: [
        { provide: EventFeed, useValue: { search: (q: EventQuery) => (queries.push(q), history()) } },
        { provide: LiveEvents, useValue: { events$: live } },
      ],
    });
    states = [];
    TestBed.inject(WatchBlocks)
      .execute()
      .subscribe((s) => states.push(s));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    live = new Subject<ObservedEvent[]>();
    queries = [];
    history = () => of([blocks[0]!]);
  });

  afterEach(() => vi.useRealTimers());

  it('pide los Bloqueos desde las 00:00 de hace 6 días', () => {
    start();
    expect(queries).toStrictEqual([{ eventTypes: ['tool.blocked'], since: windowStart(now), limit: 500 }]);
    expect(windowStart(now)).toStrictEqual(new Date(2026, 8, 19));
  });

  it('añade en vivo solo los Bloqueos', () => {
    start();
    live.next([observedEvent({ id: 'normal' }), blocked('nuevo', 'dangerous-rm', day(0, 17))]);
    expect(states.at(-1)!.blocks.map((b) => b.id)).toStrictEqual(['nuevo', 'a']);
  });

  it('si el historial falla lo indica y sigue en vivo', () => {
    history = () => throwError(() => new Error('500'));
    start();
    live.next([blocked('nuevo', 'dangerous-rm', day(0, 17))]);
    expect(states.at(-1)).toMatchObject({ loaded: true, failed: true });
    expect(states.at(-1)!.blocks).toHaveLength(1);
  });
});

describe('AC-22: BlocksPage', () => {
  let state$: BehaviorSubject<BlocksState>;

  async function render(url = '/bloqueos') {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'bloqueos', component: BlocksPage }]),
        { provide: WatchBlocks, useValue: { execute: () => state$ } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness;
  }

  const el = (harness: RouterTestingHarness) => harness.routeNativeElement!;
  const rows = (harness: RouterTestingHarness) => [...el(harness).querySelectorAll('[data-testid="block-row"]')];

  beforeEach(() => {
    // Solo el reloj: los temporizadores reales hacen falta para el router de pruebas.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    state$ = new BehaviorSubject<BlocksState>({ blocks: blocks.slice(0, 3), loaded: true, failed: false });
  });

  afterEach(() => vi.useRealTimers());

  it('muestra las fichas, las barras por día y la tabla', async () => {
    const harness = await render();
    const kpis = el(harness).querySelector('[data-testid="block-kpis"]');

    expect(text(kpis?.querySelector('[data-kpi="week"]'))).toContain('3');
    expect(text(kpis?.querySelector('[data-kpi="top-rule"]'))).toContain('dangerous-rm');
    expect(text(kpis?.querySelector('[data-kpi="sessions"]'))).toContain('2');
    expect(el(harness).querySelectorAll('[data-testid="block-day"]')).toHaveLength(7);
    expect(rows(harness)).toHaveLength(3);
    expect(text(rows(harness)[0])).toContain('rm -rf /');
    expect(text(rows(harness)[0])).toContain('Motivo de dangerous-rm');
  });

  it('enlaza cada Bloqueo con la pestaña de Bloqueos de su Sesión', async () => {
    const harness = await render();
    expect(rows(harness)[0]!.querySelector('a')?.getAttribute('href')).toBe(
      '/sesiones/s1?pestana=bloqueos',
    );
  });

  it('filtra por Regla desde la URL y al pulsar su badge', async () => {
    const harness = await render('/bloqueos?regla=sensitive-file');
    expect(rows(harness)).toHaveLength(1);

    await harness.navigateByUrl('/bloqueos');
    (rows(harness)[0]!.querySelector('.rule-button') as HTMLButtonElement).click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/bloqueos?regla=dangerous-rm');
    expect(rows(harness)).toHaveLength(2);
  });

  it('AC-80: un Bloqueo de la regla budget sin herramienta (un prompt rechazado) se lee bien', async () => {
    const prompt = observedEvent({
      id: 'p',
      sessionId: 's3',
      eventType: 'tool.blocked',
      nativeEventType: 'UserPromptSubmit',
      toolName: null,
      occurredAt: day(0, 11),
      receivedAt: day(0, 11),
      payload: { prompt: 'sigue con lo anterior' },
      block: { rule: 'budget', reason: 'Presupuesto por Sesión superado: ~$9,50 de ~$5,00.' },
    });
    state$.next({ blocks: [prompt, ...blocks.slice(0, 1)], loaded: true, failed: false });
    const harness = await render('/bloqueos?regla=budget');
    expect(rows(harness)).toHaveLength(1);
    const cells = [...rows(harness)[0]!.children].map((c) => text(c));
    expect(cells.join(' | ')).toContain('— | —');
    expect(text(rows(harness)[0])).toContain('budget');
    expect(text(rows(harness)[0])).toContain('Presupuesto por Sesión superado');
    expect(rows(harness)[0]!.querySelector('a')?.getAttribute('href')).toBe('/sesiones/s3?pestana=bloqueos');
  });

  it('sin Bloqueos muestra un estado vacío', async () => {
    state$.next({ ...INITIAL_BLOCKS, loaded: true });
    const harness = await render();
    expect(text(el(harness).querySelector('[data-testid="blocks-empty"]'))).toContain('Ningún Bloqueo en 7 días');
  });
});
