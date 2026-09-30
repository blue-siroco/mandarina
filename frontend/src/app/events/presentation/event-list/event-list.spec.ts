import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';
import { stubDownloadSource } from '../../../downloads/testing/download-fixtures';
import { DownloadTarget } from '../../../downloads/models/download';
import { LoadEventFilterOptions } from '../../application/load-event-filter-options';
import { INITIAL_STATE, RecentEventsState, WatchRecentEvents } from '../../application/watch-recent-events';
import { observedEvent } from '../../testing/event-fixtures';
import { EventList, topTools } from './event-list';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('AC-09, AC-17: EventList', () => {
  let state$: BehaviorSubject<RecentEventsState>;

  async function render(url = '/eventos') {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'eventos', component: EventList }]),
        { provide: WatchRecentEvents, useValue: { execute: () => state$ } },
        { provide: LoadEventFilterOptions, useValue: { execute: () => of({ projects: [], sessions: [] }) } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness;
  }

  const rows = (harness: RouterTestingHarness) =>
    [...harness.routeNativeElement!.querySelectorAll('[data-testid="event-row"]')] as HTMLElement[];

  beforeEach(() => {
    state$ = new BehaviorSubject<RecentEventsState>(INITIAL_STATE);
  });

  it('AC-09: muestra que está cargando mientras no llega el historial', async () => {
    const harness = await render();
    expect(text(harness.routeNativeElement)).toContain('Cargando Eventos');
  });

  it('AC-09: muestra un estado vacío con instrucciones de instalación', async () => {
    state$.next({ ...INITIAL_STATE, loaded: true });
    const harness = await render();
    expect(text(harness.routeNativeElement!.querySelector('[data-testid="empty-state"]'))).toContain('send_event.mjs');
  });

  it('AC-09: pinta una fila por Evento con hora, Proyecto, Sesión abreviada, Tipo, herramienta y Directorio', async () => {
    state$.next({
      ...INITIAL_STATE,
      loaded: true,
      events: [observedEvent({ id: 'b', subagentId: 'agent-1' }), observedEvent({ id: 'a', toolName: null, payload: {} })],
    });
    const harness = await render();
    const [first, second] = rows(harness);

    expect(rows(harness)).toHaveLength(2);
    expect(text(first)).toContain('demo');
    expect(text(first)).toContain('7f3c2a10');
    expect(text(first)).not.toContain('7f3c2a10-1b2c');
    expect(text(first)).toContain('Herramienta (antes)');
    expect(text(first)).toContain('Bash');
    expect(text(first)).toContain('subagente');
    expect(text(first)).toContain('C:\\Codev\\demo');
    expect(text(second)).toContain('—');
  });

  it('AC-09: añade los Eventos nuevos sin recargar', async () => {
    state$.next({ ...INITIAL_STATE, loaded: true, events: [observedEvent({ id: 'a' })] });
    const harness = await render();

    state$.next({ ...INITIAL_STATE, loaded: true, events: [observedEvent({ id: 'b' }), observedEvent({ id: 'a' })] });
    await harness.fixture.whenStable();

    expect(rows(harness)).toHaveLength(2);
  });

  it('AC-09: avisa si el historial no se pudo cargar', async () => {
    state$.next({ ...INITIAL_STATE, loaded: true, historyFailed: true });
    const harness = await render();
    expect(harness.routeNativeElement!.querySelector('[role="alert"]')).not.toBeNull();
  });

  describe('AC-17: filtros', () => {
    const events = [
      observedEvent({ id: 'p', eventType: 'prompt.submitted', toolName: null, payload: { prompt: 'Hola' } }),
      observedEvent({ id: 'r', toolName: 'Read', payload: { tool_input: { file_path: 'a.ts' } } }),
      observedEvent({ id: 'b1', toolName: 'Bash' }),
      observedEvent({ id: 'b2', eventType: 'tool.post', toolName: 'Bash' }),
    ];

    beforeEach(() => state$.next({ ...INITIAL_STATE, loaded: true, events }));

    it('filtra por categoría desde la URL y cuenta filtrados / cargados', async () => {
      const harness = await render('/eventos?categoria=prompts');
      expect(rows(harness)).toHaveLength(1);
      expect(text(harness.routeNativeElement!.querySelector('[data-testid="event-count"]'))).toContain('Eventos: 1 / 4');
    });

    it('filtra por herramienta y la elección queda en la URL', async () => {
      const harness = await render();
      const chips = [...harness.routeNativeElement!.querySelectorAll('[data-testid="tool-filter"]')] as HTMLButtonElement[];
      expect(chips.map((c) => text(c))).toStrictEqual(['Bash', 'Read']);

      chips[0]!.click();
      await harness.fixture.whenStable();

      expect(TestBed.inject(Router).url).toBe('/eventos?herramienta=Bash');
      expect(rows(harness)).toHaveLength(2);
      expect(chips[0]!.getAttribute('aria-pressed')).toBe('true');
    });

    it('AC-68: la categoría Avisos deja solo los Eventos con avisos vigentes y queda en la URL', async () => {
      const warning = (dismissed: boolean) => ({ id: 'w:fake-system-tag', pattern: 'fake-system-tag', severity: 'high' as const, dismissed });
      state$.next({
        ...INITIAL_STATE,
        loaded: true,
        events: [
          ...events,
          observedEvent({ id: 'w1', eventType: 'tool.post', toolName: 'WebFetch', warnings: [warning(false)] }),
          observedEvent({ id: 'w2', eventType: 'tool.post', toolName: 'WebFetch', warnings: [warning(true)] }),
        ],
      });
      const harness = await render('/eventos?categoria=warnings');

      expect(rows(harness)).toHaveLength(1);
      expect(text(harness.routeNativeElement!.querySelector('[data-testid="event-count"]'))).toContain('Eventos: 1 / 6');
      const options = (harness.routeNativeElement!.querySelector('[data-testid="category-filter"] lucia--togglebuttons') as unknown as {
        toogleOptions: { defaultSelectedOption: number; options: Array<{ text: string }> };
      }).toogleOptions;
      expect(options.options.at(-1)!.text).toBe('Avisos');
      expect(options.defaultSelectedOption).toBe(options.options.length - 1);
    });

    it('sin coincidencias ofrece limpiar los filtros', async () => {
      const harness = await render('/eventos?categoria=blocks');
      const noMatches = harness.routeNativeElement!.querySelector('[data-testid="no-matches"]');
      expect(noMatches).not.toBeNull();

      (noMatches!.querySelector('button') as HTMLButtonElement).click();
      await harness.fixture.whenStable();

      expect(TestBed.inject(Router).url).toBe('/eventos');
      expect(rows(harness)).toHaveLength(4);
    });
  });
});

describe('AC-17: topTools', () => {
  it('ordena por frecuencia y recorta', () => {
    const events = ['Bash', 'Read', 'Bash', 'Edit', 'Bash', 'Read'].map((toolName, i) =>
      observedEvent({ id: String(i), toolName }),
    );
    expect(topTools(events, 2)).toStrictEqual(['Bash', 'Read']);
  });
});

describe('AC-36: EventList sin Subagentes internos', () => {
  const internal = { type: null, description: null, durationMs: null, internal: true };
  const events = [
    observedEvent({ id: 'x1', eventType: 'subagent.stopped', toolName: null, subagentId: 'x1', subagent: internal }),
    observedEvent({ id: 'b', eventType: 'prompt.submitted', toolName: null, payload: { prompt: 'Hola' } }),
    observedEvent({ id: 'a', eventType: 'subagent.started', toolName: null, subagentId: 'a1', subagent: { ...internal, type: 'Explore', internal: false } }),
  ];

  async function render(url = '/eventos') {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'eventos', component: EventList }]),
        { provide: WatchRecentEvents, useValue: { execute: () => new BehaviorSubject<RecentEventsState>({ ...INITIAL_STATE, loaded: true, events }) } },
        { provide: LoadEventFilterOptions, useValue: { execute: () => of({ projects: [], sessions: [] }) } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness;
  }

  const rows = (harness: RouterTestingHarness) => [...harness.routeNativeElement!.querySelectorAll('[data-testid="event-row"]')];
  const count = (harness: RouterTestingHarness) => text(harness.routeNativeElement!.querySelector('[data-testid="event-count"]'));

  it('oculta los internos por defecto y los cuenta como filtrados', async () => {
    const harness = await render();
    expect(rows(harness)).toHaveLength(2);
    expect(count(harness)).toContain('Eventos: 2 / 3');
  });

  it('"Mostrar internos" los enseña y queda en la URL', async () => {
    const harness = await render();
    const box = harness.routeNativeElement!.querySelector('[data-testid="internal-filter"] input') as HTMLInputElement;
    box.click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/eventos?internos=1');
    expect(rows(harness)).toHaveLength(3);

    await harness.navigateByUrl('/eventos');
    expect(rows(harness)).toHaveLength(2);
  });
});

describe('AC-110: filtros de Proyecto, Sesión y periodo', () => {
  const S1 = '11111111-aaaa';
  const S2 = '22222222-bbbb';
  let filters: unknown[];

  async function render(url = '/eventos', events = [observedEvent({ id: 'a' })]) {
    filters = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'eventos', component: EventList }]),
        {
          provide: WatchRecentEvents,
          useValue: {
            execute: (f: unknown) => {
              filters.push(f);
              return new BehaviorSubject<RecentEventsState>({ ...INITIAL_STATE, loaded: true, events });
            },
          },
        },
        {
          provide: LoadEventFilterOptions,
          useValue: {
            execute: () =>
              of({
                projects: ['lucia', 'mandarina'],
                sessions: [
                  { id: S1, project: 'mandarina' },
                  { id: S2, project: 'lucia' },
                ],
              }),
          },
        },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness;
  }

  const select = (harness: RouterTestingHarness, testid: string) =>
    harness.routeNativeElement!.querySelector(`[data-testid="${testid}"] select`) as HTMLSelectElement;
  const optionValues = (el: HTMLSelectElement) => [...el.options].map((o) => o.value);

  it('sin parámetros no filtra en el servidor y el periodo es Todo', async () => {
    await render();
    expect(filters.at(-1)).toStrictEqual({ project: undefined, sessionId: undefined, windowMs: undefined });
  });

  it('la URL con proyecto, sesion y periodo se aplica al pedir los Eventos', async () => {
    const harness = await render(`/eventos?proyecto=mandarina&sesion=${S1}&periodo=24h`);
    expect(filters.at(-1)).toStrictEqual({ project: 'mandarina', sessionId: S1, windowMs: 24 * 3_600_000 });
    expect(select(harness, 'project-filter').value).toBe('mandarina');
    expect(select(harness, 'session-filter').value).toBe(S1);
  });

  it('elegir un Proyecto lo deja en la URL, repite la consulta y suelta la Sesión', async () => {
    const harness = await render(`/eventos?sesion=${S1}`);
    const project = select(harness, 'project-filter');
    project.value = 'lucia';
    project.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/eventos?proyecto=lucia');
    expect(filters.at(-1)).toStrictEqual({ project: 'lucia', sessionId: undefined, windowMs: undefined });
  });

  it('las Sesiones ofrecidas son las del Proyecto elegido, con su id abreviado', async () => {
    const harness = await render('/eventos?proyecto=mandarina');
    const session = select(harness, 'session-filter');
    expect(optionValues(session)).toStrictEqual(['', S1]);
    expect(session.options[1]!.textContent?.trim()).toBe('11111111');
  });

  it('elegir una Sesión y un periodo los refleja en la URL', async () => {
    const harness = await render();
    const session = select(harness, 'session-filter');
    session.value = S2;
    session.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe(`/eventos?sesion=${S2}`);

    (harness.routeNativeElement!.querySelector('[data-testid="period-filter"] lucia--togglebuttons') as HTMLElement).dispatchEvent(
      new CustomEvent('callback', { detail: { value: 2 } }),
    );
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toContain('periodo=7d');
    expect(filters.at(-1)).toMatchObject({ sessionId: S2, windowMs: 7 * 24 * 3_600_000 });
  });

  it('con filtro de servidor y sin resultados no dice que no hay Eventos: ofrece limpiar', async () => {
    const harness = await render('/eventos?proyecto=lucia', []);
    expect(harness.routeNativeElement!.querySelector('[data-testid="empty-state"]')).toBeNull();
    const noMatches = harness.routeNativeElement!.querySelector('[data-testid="no-matches"]')!;
    (noMatches.querySelector('button') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/eventos');
  });
});

describe('AC-148: Descargar Eventos', () => {
  async function render(url = '/eventos', events = [observedEvent({ id: 'a' })]) {
    const download = stubDownloadSource();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'eventos', component: EventList }]),
        {
          provide: WatchRecentEvents,
          useValue: { execute: () => new BehaviorSubject<RecentEventsState>({ ...INITIAL_STATE, loaded: true, events }) },
        },
        { provide: LoadEventFilterOptions, useValue: { execute: () => of({ projects: [], sessions: [] }) } },
        download.provider,
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return { harness, download };
  }
  const button = (h: RouterTestingHarness) => h.routeNativeElement!.querySelector<HTMLButtonElement>('[data-testid="download-events"]')!;

  async function open(h: RouterTestingHarness) {
    // jsdom no da foco al hacer clic, como sí hace el navegador.
    button(h).focus();
    button(h).click();
    await h.fixture.whenStable();
  }

  it('el botón «Descargar Eventos» está junto a los filtros y es alcanzable por teclado', async () => {
    const { harness } = await render();
    const b = button(harness);
    expect(text(b)).toBe('Descargar Eventos');
    expect(b.closest('[aria-label="Filtros de Eventos"]')).not.toBeNull();
    expect(b.tabIndex).toBe(0);
    expect(b.disabled).toBe(false);
  });

  it('sin Eventos en la lista el botón está desactivado', async () => {
    const { harness } = await render('/eventos', []);
    expect(button(harness).disabled).toBe(true);
  });

  it('abre el diálogo en modo Eventos con los filtros vigentes', async () => {
    const { harness, download } = await render('/eventos?proyecto=lucia&sesion=s-1&categoria=tools&herramienta=Bash&herramienta=Read');
    await open(harness);
    expect(text(harness.routeNativeElement!.querySelector('#download-title'))).toBe('Descarga de Eventos');
    const target = download.calls[0]!.target as Extract<DownloadTarget, { kind: 'events' }>;
    expect(target.filters).toMatchObject({
      project: 'lucia',
      sessionId: 's-1',
      eventTypes: ['tool.pre', 'tool.post'],
      tools: ['Bash', 'Read'],
    });
    expect(target.filters.since).toBeUndefined();
  });

  it('el rango se traduce a since al abrir', async () => {
    const { harness, download } = await render('/eventos?periodo=1h');
    const before = Date.now();
    await open(harness);
    const target = download.calls[0]!.target as Extract<DownloadTarget, { kind: 'events' }>;
    expect(Math.abs(target.filters.since!.getTime() - (before - 3_600_000))).toBeLessThan(5_000);
  });

  it('sin filtros el objetivo no lleva ninguno', async () => {
    const { harness, download } = await render();
    await open(harness);
    expect(download.calls[0]!.target).toStrictEqual({
      kind: 'events',
      filters: { project: undefined, sessionId: undefined, since: undefined, eventTypes: undefined, tools: undefined },
    });
  });

  it('cerrar con Escape devuelve el foco al botón', async () => {
    const { harness } = await render();
    await open(harness);
    harness.routeNativeElement!.querySelector<HTMLElement>('[data-testid="download-overlay"]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await harness.fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    expect(harness.routeNativeElement!.querySelector('app-download-dialog')).toBeNull();
    expect(document.activeElement).toBe(button(harness));
  });
});
