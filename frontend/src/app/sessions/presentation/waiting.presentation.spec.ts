import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AlertSound } from '../../budgets/application/alert-sound';
import {
  INITIAL_WAITING,
  WaitingState,
  WatchWaitingSessions,
} from '../application/watch-waiting-sessions';
import { SessionSummary, SessionWaiting } from '../models/session';
import { sessionSummary } from '../testing/session-fixtures';
import { SessionCard } from './session-card/session-card';
import { WaitingAlert } from './waiting-alert/waiting-alert';
import { WaitingBadge } from './waiting-badge/waiting-badge';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const NOW = new Date('2026-09-30T10:10:00.000Z');

const wait = (overrides: Partial<SessionWaiting> = {}): SessionWaiting => ({
  since: new Date('2026-09-30T10:00:00.000Z'),
  reason: 'permission',
  tool: 'Bash',
  summary: 'npm run build',
  subagent: null,
  ...overrides,
});

const waitingSession = (waiting: Partial<SessionWaiting> = {}, id = 'aaaaaaaa-1'): SessionSummary =>
  sessionSummary({
    sessionId: id,
    project: 'mandarina',
    activity: 'waiting',
    waiting: wait(waiting),
  });

async function badge(w: SessionWaiting, now: Date | null = null) {
  await TestBed.configureTestingModule({ imports: [WaitingBadge] }).compileComponents();
  const fixture = TestBed.createComponent(WaitingBadge);
  fixture.componentRef.setInput('waiting', w);
  fixture.componentRef.setInput('now', now);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('AC-94: WaitingBadge', () => {
  it('permiso: badge Esperando y motivo con herramienta y comando', async () => {
    const el = await badge(wait());
    expect(text(el.querySelector('[data-testid="waiting-badge"]'))).toBe('Esperando');
    expect(text(el.querySelector('[data-testid="waiting-reason"]'))).toBe(
      'Pide permiso para Bash: npm run build',
    );
  });

  it('permiso sin herramienta muestra solo el resumen', async () => {
    const el = await badge(wait({ tool: null, summary: 'Claude necesita tu permiso' }));
    expect(text(el.querySelector('[data-testid="waiting-reason"]'))).toBe(
      'Pide permiso: Claude necesita tu permiso',
    );
  });

  it('pregunta: "Pregunta: …"', async () => {
    const el = await badge(
      wait({ reason: 'question', tool: 'AskUserQuestion', summary: '¿Qué rama uso?' }),
    );
    expect(text(el.querySelector('[data-testid="waiting-reason"]'))).toBe(
      'Pregunta: ¿Qué rama uso?',
    );
  });

  it('inactividad: "Inactiva esperando tu respuesta"', async () => {
    const el = await badge(wait({ reason: 'idle', tool: null, summary: null }));
    expect(text(el.querySelector('[data-testid="waiting-reason"]'))).toBe(
      'Inactiva esperando tu respuesta',
    );
  });

  it('si espera un Subagente lo dice', async () => {
    const el = await badge(wait({ subagent: { id: 's1', type: 'e2e-builder' } }));
    expect(text(el.querySelector('[data-testid="waiting-reason"]'))).toBe(
      'Subagente e2e-builder pide permiso para Bash: npm run build',
    );
  });

  it('Subagente sin Tipo usa su identificador corto', async () => {
    const el = await badge(
      wait({
        reason: 'question',
        tool: null,
        summary: 'hola',
        subagent: { id: 'abcdef123456', type: null },
      }),
    );
    expect(text(el.querySelector('[data-testid="waiting-reason"]'))).toBe(
      'Subagente abcdef12 pregunta: hola',
    );
  });

  it('con reloj indica cuánto lleva esperando', async () => {
    const el = await badge(wait(), NOW);
    expect(text(el.querySelector('[data-testid="waiting-since"]'))).toBe('desde hace 10 min');
  });

  it('pinta el motivo como texto, nunca como HTML', async () => {
    const el = await badge(wait({ summary: '<img src=x onerror=alert(1)>' }));
    expect(el.querySelector('img')).toBeNull();
    expect(text(el.querySelector('[data-testid="waiting-reason"]'))).toContain(
      '<img src=x onerror=alert(1)>',
    );
  });
});

describe('AC-94: SessionCard Esperando', () => {
  async function card(session: SessionSummary) {
    await TestBed.configureTestingModule({
      imports: [SessionCard],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(SessionCard);
    fixture.componentRef.setInput('session', session);
    fixture.componentRef.setInput('now', NOW);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('muestra el badge Esperando y el motivo, sin Trabajando ni En pausa', async () => {
    const el = await card(waitingSession());
    expect(text(el.querySelector('[data-testid="waiting-badge"]'))).toBe('Esperando');
    expect(text(el.querySelector('[data-testid="waiting-reason"]'))).toBe(
      'Pide permiso para Bash: npm run build',
    );
    expect(el.querySelector('[data-testid="working"]')).toBeNull();
    expect(text(el)).not.toContain('En pausa');
  });

  it('al dejar de esperar vuelve el badge de Trabajando', async () => {
    const el = await card(sessionSummary({ activity: 'working', waiting: null }));
    expect(el.querySelector('[data-testid="waiting-badge"]')).toBeNull();
    expect(el.querySelector('[data-testid="working"]')).not.toBeNull();
  });
});

describe('AC-95 / AC-96: WaitingAlert', () => {
  const state$ = new BehaviorSubject<WaitingState>(INITIAL_WAITING);
  let setMuted: ReturnType<typeof vi.fn>;

  async function render(state: WaitingState) {
    state$.next(state);
    setMuted = vi.fn();
    await TestBed.configureTestingModule({
      imports: [WaitingAlert],
      providers: [
        provideRouter([]),
        { provide: WatchWaitingSessions, useValue: { state$ } },
        { provide: AlertSound, useValue: { muted: () => false, setMuted } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(WaitingAlert);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }
  const loaded = (items: SessionSummary[], extra: Partial<WaitingState> = {}): WaitingState => ({
    count: items.length,
    oldest: items[0] ?? null,
    loaded: true,
    failed: false,
    ...extra,
  });

  it('sin esperas no muestra aviso pero mantiene la región de estado', async () => {
    const el = await render(loaded([]));
    expect(el.querySelector('[role="status"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="waiting-alert"]')).toBeNull();
  });

  it('con una Sesión, singular, Proyecto, motivo y enlace a su detalle', async () => {
    const el = await render(loaded([waitingSession()]));
    const alert = el.querySelector('[data-testid="waiting-alert"]')!;
    expect(el.querySelector('[role="status"]')).not.toBeNull();
    expect(text(alert.querySelector('[data-testid="waiting-alert-count"]'))).toBe(
      '1 Sesión esperando',
    );
    expect(text(alert)).toContain('mandarina');
    expect(text(alert.querySelector('[data-testid="waiting-reason"]'))).toBe(
      'Pide permiso para Bash: npm run build',
    );
    expect(alert.querySelector('a')?.getAttribute('href')).toBe('/sesiones/aaaaaaaa-1');
  });

  it('con varias, plural', async () => {
    const el = await render(loaded([waitingSession(), waitingSession({}, 'bbbbbbbb-2')]));
    expect(text(el.querySelector('[data-testid="waiting-alert-count"]'))).toBe(
      '2 Sesiones esperando',
    );
  });

  it('si la más antigua espera un Subagente, lo dice', async () => {
    const el = await render(
      loaded([waitingSession({ subagent: { id: 'x', type: 'e2e-builder' } })]),
    );
    expect(text(el.querySelector('[data-testid="waiting-reason"]'))).toContain(
      'Subagente e2e-builder pide permiso',
    );
  });

  it('si la API falla conserva el último valor y no muestra error propio', async () => {
    const el = await render(loaded([waitingSession()], { failed: true }));
    expect(el.querySelector('[data-testid="waiting-alert"]')).not.toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(text(el)).not.toMatch(/error|fall/i);
  });

  it('el interruptor Silenciar avisos sonoros usa el servicio compartido', async () => {
    const el = await render(loaded([waitingSession()]));
    const toggle = el.querySelector<HTMLInputElement>('[data-testid="waiting-alert-mute"]')!;
    expect(text(toggle.closest('label'))).toBe('Silenciar avisos sonoros');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(setMuted).toHaveBeenCalledWith(true);
  });
});

describe('AC-114: la espera de un Subagente enlaza a su fila', () => {
  const HREF = '/sesiones/aaaaaaaa-1?pestana=subagentes&subagente=sub-9';
  const subagentWait = wait({ subagent: { id: 'sub-9', type: 'e2e-builder' } });

  async function render<T>(
    component: new () => T,
    setup: (f: ComponentFixture<T>) => void,
    providers: object[] = [],
  ) {
    await TestBed.configureTestingModule({
      imports: [component],
      providers: [provideRouter([]), ...providers],
    }).compileComponents();
    const fixture = TestBed.createComponent(component);
    setup(fixture);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }
  const link = (el: HTMLElement) => el.querySelector('[data-testid="waiting-subagent-link"]');

  it('el badge enlaza el nombre del Subagente a la pestaña Subagentes', async () => {
    const el = await render(WaitingBadge, (f) => {
      f.componentRef.setInput('waiting', subagentWait);
      f.componentRef.setInput('sessionId', 'aaaaaaaa-1');
    });
    expect(link(el)?.getAttribute('href')).toBe(HREF);
    expect(text(link(el))).toBe('e2e-builder');
    expect(text(el.querySelector('[data-testid="waiting-reason"]'))).toBe(
      'Subagente e2e-builder pide permiso para Bash: npm run build',
    );
  });

  it('sin Sesión no hay enlace', async () => {
    const el = await render(WaitingBadge, (f) => f.componentRef.setInput('waiting', subagentWait));
    expect(link(el)).toBeNull();
  });

  it('si espera el agente principal no hay enlace', async () => {
    const el = await render(WaitingBadge, (f) => {
      f.componentRef.setInput('waiting', wait());
      f.componentRef.setInput('sessionId', 'aaaaaaaa-1');
    });
    expect(link(el)).toBeNull();
  });

  it('la tarjeta del board enlaza al Subagente que espera', async () => {
    const el = await render(SessionCard, (f) => {
      f.componentRef.setInput('session', waitingSession({ subagent: { id: 'sub-9', type: 'e2e-builder' } }));
      f.componentRef.setInput('now', NOW);
    });
    expect(link(el)?.getAttribute('href')).toBe(HREF);
  });

  it('el aviso de la cabecera enlaza al Subagente que espera', async () => {
    const state: WaitingState = {
      count: 1,
      oldest: waitingSession({ subagent: { id: 'sub-9', type: 'e2e-builder' } }),
      loaded: true,
      failed: false,
    };
    const el = await render(WaitingAlert, () => undefined, [
      { provide: WatchWaitingSessions, useValue: { state$: new BehaviorSubject(state) } },
      { provide: AlertSound, useValue: { muted: () => false, setMuted: () => undefined } },
    ]);
    expect(link(el)?.getAttribute('href')).toBe(HREF);
  });
});
