import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionSummary } from '../models/session';
import { sessionSummary } from '../testing/session-fixtures';
import { ContextCard, TRANSCRIPT_UNAVAILABLE, contextLevel } from './context-card/context-card';
import { SessionCard, stateReason } from './session-card/session-card';
import { ToolBars } from './tool-bars/tool-bars';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function create<T>(component: new (...args: never[]) => T, inputs: Record<string, unknown>) {
  await TestBed.configureTestingModule({ imports: [component], providers: [provideRouter([])] }).compileComponents();
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  await fixture.whenStable();
  return fixture;
}

describe('AC-19: ContextCard', () => {
  it.each([
    [0.5, 'ok'],
    [0.8, 'ok'],
    [0.81, 'warn'],
    [0.95, 'warn'],
    [0.96, 'danger'],
  ])('con %d de ocupación el nivel es %s', (ratio, level) => {
    expect(contextLevel(ratio)).toBe(level);
  });

  it('muestra usado / límite, el % y que es una estimación', async () => {
    const fixture = await create(ContextCard, {
      context: { model: 'claude-opus-5-5', used: 91_900, limit: 1_000_000 },
      transcriptAvailable: true,
    });
    const card = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="context-card"]') as HTMLElement;
    expect(text(card)).toMatch(/91,9\smil\s\/\s1\sM\s\(9\s%\)/);
    expect(text(card)).toContain('Estimado a partir del Transcript');
    expect(card.dataset['level']).toBe('ok');
  });

  it('sin Transcript lo avisa con @lucia/info', async () => {
    const fixture = await create(ContextCard, { context: null, transcriptAvailable: false });
    const info = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="transcript-unavailable"]') as HTMLElement & {
      infoMessage: string;
    };
    expect(info.infoMessage).toBe(TRANSCRIPT_UNAVAILABLE);
  });
});

describe('AC-19: ToolBars', () => {
  it('ordena como llegan, escala al máximo y recorta al límite', async () => {
    const fixture = await create(ToolBars, {
      tools: [
        { name: 'Bash', count: 20 },
        { name: 'Read', count: 10 },
        { name: 'Grep', count: 1 },
      ],
      limit: 2,
    });
    const bars = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="tool-bar"]')];
    expect(bars.map((b) => [text(b.querySelector('.tools__name')), text(b.querySelector('.tools__count'))])).toStrictEqual([
      ['Bash', '20'],
      ['Read', '10'],
    ]);
    expect((bars[1]!.querySelector('.tools__fill') as HTMLElement).style.width).toBe('50%');
  });
});

describe('AC-16: SessionCard', () => {
  const now = new Date('2026-09-25T10:10:30.000Z');
  const render = (session: SessionSummary) => create(SessionCard, { session, now });

  it('muestra Estado con texto, id corto, modelo, Directorio, duraciones y contadores', async () => {
    const fixture = await render(sessionSummary());
    const card = text(fixture.nativeElement);
    expect(card).toContain('Activa');
    expect(card).toContain('hace 30 s');
    expect(card).toContain('7f3c2a10');
    expect(card).toContain('…/Codev/demo');
    expect(card).toContain('Trabajando… Bash · npm test');
    expect(card).toContain('42 min Duración activa');
    expect(card).toContain('1 h 10 min Duración de reloj');
    expect(card).toContain('2 Subagentes (1 en marcha)');
    expect(card).toContain('1 Bloqueo');
    const link = (fixture.nativeElement as HTMLElement).querySelector('a');
    expect(link?.getAttribute('href')).toBe('/sesiones/7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33');
  });

  it('AC-43: una Herramienta MCP en curso se nombra servidor · herramienta', async () => {
    const fixture = await render(sessionSummary({ currentTool: { name: 'mcp__playwright__browser_click', summary: 'Botón Guardar' } }));
    expect(text(fixture.nativeElement as HTMLElement)).toContain('Trabajando… playwright · browser_click · Botón Guardar');
  });

  it('AC-24: lista los Subagentes en marcha con su Tarea y su herramienta', async () => {
    const fixture = await render(sessionSummary());
    const live = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="live-subagent"]')];
    expect(live).toHaveLength(1);
    expect([...live[0]!.querySelectorAll('span')].map((span) => text(span))).toStrictEqual([
      '└ Explore',
      'Buscar plugins',
      'Grep TODO',
    ]);
  });

  it('sin Subagentes en marcha no pinta la lista', async () => {
    const fixture = await render(sessionSummary({ liveSubagents: [] }));
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="live-subagent"]')).toBeNull();
  });

  it('una Sesión en pausa lo dice y no muestra herramienta', async () => {
    const fixture = await render(sessionSummary({ activity: 'paused', currentTool: null }));
    expect(text(fixture.nativeElement)).toContain('En pausa');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="working"]')).toBeNull();
  });

  it('pulsar el Directorio pide filtrar por él', async () => {
    const fixture = await render(sessionSummary());
    const emitted: string[] = [];
    fixture.componentInstance.directorySelected.subscribe((d) => emitted.push(d));
    ((fixture.nativeElement as HTMLElement).querySelector('.card-session__directory') as HTMLButtonElement).click();
    expect(emitted).toStrictEqual(['C:\\Codev\\demo']);
  });

  it.each([
    [1, 'up', 'Sesión bien puntuada'],
    [-1, 'down', 'Sesión mal puntuada'],
  ] as const)('AC-59: la Puntuación %d se muestra con texto accesible', async (score, data, label) => {
    const fixture = await render(sessionSummary({ evaluationScore: score }));
    const badge = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="session-score"]') as HTMLElement;
    expect(text(badge)).toBe(label);
    expect(badge.dataset['score']).toBe(data);
    expect(badge.getAttribute('title')).toBe(label);
  });

  it('AC-59: sin Puntuación no muestra nada', async () => {
    const fixture = await render(sessionSummary({ evaluationScore: null }));
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="session-score"]')).toBeNull();
  });

  it.each([
    [1, '1 aviso de inyección'],
    [3, '3 avisos de inyección'],
  ])('AC-68: con %d aviso(s) de severidad alta lleva el badge, que enlaza a Seguridad filtrado por la Sesión', async (alerts, label) => {
    const fixture = await render(sessionSummary({ injectionAlerts: alerts }));
    const badge = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="session-alerts"]') as HTMLAnchorElement;
    expect(text(badge)).toBe(label);
    expect(badge.getAttribute('href')).toBe('/seguridad?pestana=avisos&severidad=alta&sesion=7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33');
  });

  it('AC-84: una Sesión detenida por presupuesto lo dice con texto y enlaza a Presupuestos', async () => {
    const fixture = await render(sessionSummary({ budgetStopped: true }));
    const badge = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="session-budget-stopped"]') as HTMLAnchorElement;
    expect(text(badge)).toBe('Detenida por presupuesto');
    expect(badge.getAttribute('href')).toBe('/presupuestos');
  });

  it('AC-84: una Sesión que no se ha detenido por presupuesto no lleva el badge', async () => {
    const fixture = await render(sessionSummary({ budgetStopped: false }));
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="session-budget-stopped"]')).toBeNull();
  });

  it('AC-68: sin avisos no muestra nada', async () => {
    const fixture = await render(sessionSummary({ injectionAlerts: 0 }));
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="session-alerts"]')).toBeNull();
  });

  it('explica el motivo de cada Estado', () => {
    expect(stateReason(sessionSummary({ state: 'orphaned' }), now)).toBe(
      'Sin actividad desde hace 30 s y sin session.ended',
    );
    expect(stateReason(sessionSummary({ state: 'active', activity: 'working' }), now)).toContain('Turno en curso');
  });
});
