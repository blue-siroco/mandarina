import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { LiveEvents } from '../../events/application/live-events';
import { BudgetStateChange } from '../../events/models/observed-event';
import { SessionSource } from '../../sessions/ports/session-source';
import { AlertSound } from '../application/alert-sound';
import { ManageBudgets } from '../application/manage-budgets';
import { BudgetsState, INITIAL_BUDGETS, WatchBudgets } from '../application/watch-budgets';
import { Budget } from '../models/budget';
import { SESSION_ID, allowance, budget, budgetAllowanceDto, budgetSubjectDto, sessionBudget } from '../testing/budget-fixtures';
import { BudgetAlert } from './budget-alert/budget-alert';
import { EMPTY_DRAFT, draftOf, parseAmount, toBudgetInput, validateDraft } from './budget-form';
import { BudgetsPage } from './budgets-page/budgets-page';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const loaded = (items: Budget[]): BudgetsState => ({ items, loaded: true, failed: false });

const nearGlobal = () =>
  budget({ state: 'near', spent_usd: 42, subjects: [budgetSubjectDto({ spent_usd: 42, ratio: 0.84, state: 'near' })] });
const overGlobal = () =>
  budget({ id: 'b9', state: 'exceeded', spent_usd: 52, subjects: [budgetSubjectDto({ spent_usd: 52, ratio: 1.04, state: 'exceeded' })] });

const change = (overrides: Partial<BudgetStateChange> = {}): BudgetStateChange => ({
  budgetId: 'b1',
  scope: 'global_day',
  project: null,
  sessionId: null,
  action: 'stop',
  state: 'exceeded',
  previousState: 'within',
  spentUsd: 52,
  limitUsd: 50,
  ...overrides,
});

describe('AC-82: formulario de Presupuesto', () => {
  it('parseAmount acepta coma y punto y rechaza lo que no es un número', () => {
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount(' 3.25 ')).toBe(3.25);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });

  it('valida como el servidor: límite mayor que 0, umbral de 1 a 100 y Proyecto en project_day', () => {
    expect(validateDraft({ ...EMPTY_DRAFT, limit: '50' })).toStrictEqual({});
    expect(validateDraft(EMPTY_DRAFT)).toStrictEqual({ limit: 'El límite debe ser un número mayor que 0' });
    expect(validateDraft({ ...EMPTY_DRAFT, limit: '0' }).limit).toBeDefined();
    expect(validateDraft({ ...EMPTY_DRAFT, limit: '5', threshold: '101' }).threshold).toBeDefined();
    expect(validateDraft({ ...EMPTY_DRAFT, limit: '5', threshold: '0' }).threshold).toBeDefined();
    expect(validateDraft({ ...EMPTY_DRAFT, limit: '5', scope: 'project_day' }).project).toBe('Elige el Proyecto');
    expect(validateDraft({ ...EMPTY_DRAFT, limit: '5', scope: 'session' })).toStrictEqual({});
  });

  it('toBudgetInput pasa el umbral a fracción y quita el Proyecto de un global', () => {
    expect(toBudgetInput({ scope: 'global_day', project: 'demo', limit: '12,5', threshold: '80', action: 'warn' }, false)).toStrictEqual({
      scope: 'global_day',
      project: null,
      limitUsd: 12.5,
      warnRatio: 0.8,
      action: 'warn',
      enabled: false,
    });
    expect(toBudgetInput({ scope: 'session', project: '', limit: '5', threshold: '50', action: 'stop' }, true).project).toBeNull();
  });

  it('draftOf devuelve al formulario lo guardado', () => {
    expect(draftOf(budget({ scope: 'project_day', project: 'demo', limit_usd: 6, warn_ratio: 0.85, action: 'warn' }))).toStrictEqual({
      scope: 'project_day',
      project: 'demo',
      limit: '6',
      threshold: '85',
      action: 'warn',
    });
  });
});

describe('AC-83: BudgetAlert', () => {
  let state$: BehaviorSubject<BudgetsState>;
  let changes$: Subject<BudgetStateChange>;
  let sound: { muted: ReturnType<typeof signal<boolean>>; setMuted: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn> };

  async function render() {
    await TestBed.configureTestingModule({
      imports: [BudgetAlert],
      providers: [
        provideRouter([]),
        { provide: WatchBudgets, useValue: { state$ } },
        { provide: LiveEvents, useValue: { budgetChanges$: changes$ } },
        { provide: AlertSound, useValue: sound },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(BudgetAlert);
    await fixture.whenStable();
    return fixture;
  }
  const el = (f: { nativeElement: unknown }) => f.nativeElement as HTMLElement;

  beforeEach(() => {
    state$ = new BehaviorSubject<BudgetsState>(INITIAL_BUDGETS);
    changes$ = new Subject<BudgetStateChange>();
    sound = { muted: signal(false), setMuted: vi.fn((muted: boolean) => sound.muted.set(muted)), play: vi.fn() };
  });

  it('la región viva existe siempre, pero sin Presupuestos Cerca o Superados no dice nada', async () => {
    state$.next(loaded([budget()]));
    const fixture = await render();
    expect(el(fixture).querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(el(fixture).querySelector('[data-testid="budget-alert"]')).toBeNull();
  });

  it('avisa del peor: estado en texto, ámbito, gastado y límite, y enlaza a /presupuestos', async () => {
    state$.next(loaded([nearGlobal(), overGlobal()]));
    const fixture = await render();
    const alert = el(fixture).querySelector('[data-testid="budget-alert"]')!;
    expect(alert.getAttribute('data-state')).toBe('exceeded');
    expect(text(alert.querySelector('[data-testid="budget-alert-state"]'))).toBe('Superado');
    expect(text(alert.querySelector('[data-testid="budget-alert-message"]'))).toMatch(/^Presupuesto global del día superado: ~.*52.* de ~.*50/);
    expect(text(alert.querySelector('[data-testid="budget-alert-more"]'))).toBe('y 1 más');
    expect(alert.querySelector('a')!.getAttribute('href')).toBe('/presupuestos');
  });

  it('Cerca se distingue de Superado con el texto', async () => {
    state$.next(loaded([nearGlobal()]));
    const fixture = await render();
    expect(text(el(fixture).querySelector('[data-testid="budget-alert-state"]'))).toBe('Cerca');
    expect(el(fixture).querySelector('[data-testid="budget-alert-more"]')).toBeNull();
  });

  it('no avisa de un Presupuesto desactivado ni de un ámbito con excepción vigente', async () => {
    state$.next(loaded([{ ...overGlobal(), enabled: false }, budget({ subjects: [budgetSubjectDto({ state: 'exceeded', allowed: true })] })]));
    const fixture = await render();
    expect(el(fixture).querySelector('[data-testid="budget-alert"]')).toBeNull();
  });

  it('aparece y desaparece solo al cambiar el estado', async () => {
    const fixture = await render();
    expect(el(fixture).querySelector('[data-testid="budget-alert"]')).toBeNull();
    state$.next(loaded([overGlobal()]));
    await fixture.whenStable();
    expect(el(fixture).querySelector('[data-testid="budget-alert"]')).not.toBeNull();
    state$.next(loaded([budget()]));
    await fixture.whenStable();
    expect(el(fixture).querySelector('[data-testid="budget-alert"]')).toBeNull();
  });

  it('suena al llegar por el WebSocket una transición a peor, con el tono de su estado', async () => {
    await render();
    changes$.next(change({ state: 'near', previousState: 'within' }));
    changes$.next(change({ state: 'exceeded', previousState: 'near' }));
    expect(sound.play.mock.calls).toStrictEqual([['near'], ['exceeded']]);
  });

  it('no suena al mejorar ni por lo que no cambia de estado', async () => {
    await render();
    changes$.next(change({ state: 'within', previousState: 'exceeded' }));
    changes$.next(change({ state: 'near', previousState: 'exceeded' }));
    changes$.next(change({ state: 'exceeded', previousState: 'exceeded' }));
    expect(sound.play).not.toHaveBeenCalled();
  });

  it('nunca suena al cargar: sin mensajes del socket no hay sonido aunque ya esté Superado', async () => {
    state$.next(loaded([overGlobal()]));
    await render();
    expect(sound.play).not.toHaveBeenCalled();
  });

  it('el interruptor Silenciar avisos lo guarda en el servicio', async () => {
    state$.next(loaded([overGlobal()]));
    const fixture = await render();
    const toggle = el(fixture).querySelector<HTMLInputElement>('[data-testid="budget-alert-mute"]')!;
    expect(toggle.checked).toBe(false);
    toggle.click();
    expect(sound.setMuted).toHaveBeenCalledWith(true);
    await fixture.whenStable();
    expect(el(fixture).querySelector<HTMLInputElement>('[data-testid="budget-alert-mute"]')!.checked).toBe(true);
  });
});

describe('AC-82: BudgetsPage', () => {
  let state$: BehaviorSubject<BudgetsState>;
  let manage: Record<keyof Pick<ManageBudgets, 'save' | 'setEnabled' | 'raiseLimit' | 'remove' | 'allow' | 'removeAllowance'>, ReturnType<typeof vi.fn>>;
  let sound: { muted: ReturnType<typeof signal<boolean>>; setMuted: ReturnType<typeof vi.fn> };

  async function render() {
    await TestBed.configureTestingModule({
      imports: [BudgetsPage],
      providers: [
        provideRouter([]),
        { provide: WatchBudgets, useValue: { state$ } },
        { provide: ManageBudgets, useValue: manage },
        { provide: AlertSound, useValue: sound },
        { provide: SessionSource, useValue: { list: () => of({ items: [], facets: { projects: ['mandarina', 'lucia'], directories: [] } }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(BudgetsPage);
    await fixture.whenStable();
    return fixture;
  }
  const el = (f: { nativeElement: unknown }) => f.nativeElement as HTMLElement;
  const q = (f: { nativeElement: unknown }, testid: string) => el(f).querySelector<HTMLElement>(`[data-testid="${testid}"]`);
  const click = async (f: { nativeElement: unknown; whenStable: () => Promise<unknown> }, testid: string) => {
    q(f, testid)!.click();
    await f.whenStable();
  };
  const type = async (f: { whenStable: () => Promise<unknown>; nativeElement: unknown }, testid: string, value: string) => {
    const input = q(f, testid) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await f.whenStable();
  };
  const select = async (f: { whenStable: () => Promise<unknown>; nativeElement: unknown }, testid: string, value: string) => {
    const control = q(f, testid) as HTMLSelectElement;
    control.value = value;
    control.dispatchEvent(new Event('change', { bubbles: true }));
    await f.whenStable();
  };

  beforeEach(() => {
    state$ = new BehaviorSubject<BudgetsState>(loaded([budget(), sessionBudget()]));
    const ok = () => of({ ok: true as const });
    manage = { save: vi.fn(ok), setEnabled: vi.fn(ok), raiseLimit: vi.fn(ok), remove: vi.fn(ok), allow: vi.fn(ok), removeAllowance: vi.fn(ok) };
    sound = { muted: signal(false), setMuted: vi.fn((muted: boolean) => sound.muted.set(muted)) };
  });

  it('lista cada Presupuesto con su ámbito, límite, gastado y porcentaje, estado en texto y acción', async () => {
    const fixture = await render();
    const rows = [...el(fixture).querySelectorAll('[data-testid="budget-row"]')];
    expect(rows).toHaveLength(2);
    expect(text(rows[0]!.querySelector('th'))).toBe('Global del día');
    expect(text(rows[0]!.querySelector('[data-testid="budget-limit"]'))).toMatch(/50/);
    expect(text(rows[0]!.querySelector('[data-testid="budget-spent"]'))).toMatch(/12.* · 24\s?%/);
    expect(text(rows[0]!.querySelector('[data-testid="budget-state"]'))).toBe('Dentro');
    expect(text(rows[0]!.querySelector('[data-testid="budget-action"]'))).toBe('Detener');
    expect(text(rows[1]!.querySelector('th'))).toBe('Por Sesión');
    expect(text(rows[1]!.querySelector('[data-testid="budget-state"]'))).toBe('Superado');
    expect(rows[1]!.querySelector('[role="progressbar"]')!.getAttribute('data-state')).toBe('exceeded');
  });

  it('el Presupuesto desactivado se ve apagado y su interruptor lo activa', async () => {
    state$.next(loaded([{ ...budget(), enabled: false }]));
    const fixture = await render();
    const toggle = q(fixture, 'budget-toggle') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(el(fixture).querySelector('[data-testid="budget-row"]')!.classList.contains('row--off')).toBe(true);
    toggle.click();
    expect(manage.setEnabled).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }), true);
  });

  it('sin Presupuestos explica qué son y ofrece crear el primero', async () => {
    state$.next(loaded([]));
    const fixture = await render();
    expect(text(q(fixture, 'budgets-empty'))).toContain('Todavía no hay Presupuestos');
    expect(q(fixture, 'budgets-table')).toBeNull();
  });

  it('avisa de un fallo de carga sin romper la pantalla y conserva lo último conocido', async () => {
    state$.next({ items: [budget()], loaded: true, failed: true });
    const fixture = await render();
    expect(text(q(fixture, 'budgets-error'))).toContain('últimos conocidos');
    expect(q(fixture, 'budgets-table')).not.toBeNull();
    state$.next({ items: [], loaded: true, failed: true });
    await fixture.whenStable();
    expect(text(q(fixture, 'budgets-error'))).toContain('No se pudieron cargar');
    expect(q(fixture, 'budgets-empty')).toBeNull();
  });

  it('el texto fijo habla de estimación, de la comprobación y de Mandarina apagado', async () => {
    const fixture = await render();
    const note = text(q(fixture, 'budgets-explanation'));
    expect(note).toContain('estimación');
    expect(note).toContain('antes de cada herramienta y de cada prompt');
    expect(note).toContain('Mandarina apagado');
  });

  describe('crear y editar', () => {
    it('valida mientras se escribe y no guarda si hay errores', async () => {
      const fixture = await render();
      await click(fixture, 'budget-new');
      expect(q(fixture, 'budget-form')).not.toBeNull();
      expect(q(fixture, 'error-limit')).toBeNull();
      await click(fixture, 'budget-save');
      expect(text(q(fixture, 'error-limit'))).toContain('mayor que 0');
      expect(manage.save).not.toHaveBeenCalled();
      await type(fixture, 'field-limit', '50');
      expect(q(fixture, 'error-limit')).toBeNull();
      await type(fixture, 'field-threshold', '150');
      expect(text(q(fixture, 'error-threshold'))).toContain('entre 1 y 100');
    });

    it('guarda un global del día y cierra el formulario', async () => {
      const fixture = await render();
      await click(fixture, 'budget-new');
      await type(fixture, 'field-limit', '50,5');
      await click(fixture, 'budget-save');
      expect(manage.save).toHaveBeenCalledWith(null, { scope: 'global_day', project: null, limitUsd: 50.5, warnRatio: 0.8, action: 'stop', enabled: true });
      expect(q(fixture, 'budget-form')).toBeNull();
    });

    it('el Proyecto solo se pide cuando aplica y viene de los que ya enviaron Eventos', async () => {
      const fixture = await render();
      await click(fixture, 'budget-new');
      expect(q(fixture, 'field-project')).toBeNull();
      await select(fixture, 'field-scope', 'project_day');
      const options = [...q(fixture, 'field-project')!.querySelectorAll('option')].map((o) => o.textContent?.trim());
      expect(options).toStrictEqual(['Elige un Proyecto', 'mandarina', 'lucia']);
      await type(fixture, 'field-limit', '10');
      await click(fixture, 'budget-save');
      expect(text(q(fixture, 'error-project'))).toBe('Elige el Proyecto');
      await select(fixture, 'field-project', 'lucia');
      await select(fixture, 'field-action', 'warn');
      await click(fixture, 'budget-save');
      expect(manage.save).toHaveBeenCalledWith(null, { scope: 'project_day', project: 'lucia', limitUsd: 10, warnRatio: 0.8, action: 'warn', enabled: true });
    });

    it('editar rellena el formulario con lo guardado y conserva si estaba activo', async () => {
      state$.next(loaded([{ ...budget({ limit_usd: 80, warn_ratio: 0.5 }), enabled: false }]));
      const fixture = await render();
      await click(fixture, 'budget-edit');
      expect((q(fixture, 'field-limit') as HTMLInputElement).value).toBe('80');
      expect((q(fixture, 'field-threshold') as HTMLInputElement).value).toBe('50');
      await type(fixture, 'field-limit', '90');
      await click(fixture, 'budget-save');
      expect(manage.save).toHaveBeenCalledWith('b1', expect.objectContaining({ limitUsd: 90, warnRatio: 0.5, enabled: false }));
    });

    it('un error del servidor se queda junto al formulario y no pierde lo escrito', async () => {
      manage.save.mockReturnValue(of({ ok: false, message: 'El límite debe ser un número mayor que 0' }));
      const fixture = await render();
      await click(fixture, 'budget-new');
      await type(fixture, 'field-limit', '5');
      await click(fixture, 'budget-save');
      expect(text(q(fixture, 'budget-form-error'))).toBe('El límite debe ser un número mayor que 0');
      expect(q(fixture, 'budget-form')).not.toBeNull();
      expect((q(fixture, 'field-limit') as HTMLInputElement).value).toBe('5');
    });

    it('cancelar cierra el formulario sin guardar', async () => {
      const fixture = await render();
      await click(fixture, 'budget-new');
      await click(fixture, 'budget-cancel');
      expect(q(fixture, 'budget-form')).toBeNull();
      expect(manage.save).not.toHaveBeenCalled();
    });
  });

  describe('borrar', () => {
    it('pide confirmación antes de borrar', async () => {
      const fixture = await render();
      await click(fixture, 'budget-delete');
      expect(manage.remove).not.toHaveBeenCalled();
      await click(fixture, 'budget-delete-confirm');
      expect(manage.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }));
    });
  });

  describe('ámbitos, excepciones y ampliar el límite', () => {
    async function expand(id: string) {
      const fixture = await render();
      (el(fixture).querySelector(`[data-budget="${id}"] [data-testid="budget-expand"]`) as HTMLElement).click();
      await fixture.whenStable();
      return fixture;
    }

    it('despliega las Sesiones Cerca o Superadas con enlace a la Sesión', async () => {
      const fixture = await expand('b2');
      const subjects = [...el(fixture).querySelectorAll('[data-testid="budget-subject"]')];
      expect(subjects).toHaveLength(2);
      expect(subjects[0]!.querySelector('a')!.getAttribute('href')).toBe(`/sesiones/${SESSION_ID}`);
      expect(text(subjects[0]!.querySelector('.state'))).toBe('Superado');
      expect(text(subjects[1]!.querySelector('.state'))).toBe('Cerca');
    });

    it('Permitir esta Sesión y Permitir este Proyecto hoy solo salen en lo Superado con acción detener', async () => {
      const fixture = await expand('b2');
      const [over, near] = [...el(fixture).querySelectorAll('[data-testid="budget-subject"]')];
      expect(over!.querySelector('[data-testid="allow-session"]')).not.toBeNull();
      expect(over!.querySelector('[data-testid="allow-project"]')).not.toBeNull();
      expect(near!.querySelector('[data-testid="allow-session"]')).toBeNull();
      expect(near!.querySelector('[data-testid="raise-limit"]')).not.toBeNull();

      (over!.querySelector('[data-testid="allow-session"]') as HTMLElement).click();
      expect(manage.allow).toHaveBeenCalledWith(expect.objectContaining({ id: 'b2' }), { sessionId: SESSION_ID });
      (over!.querySelector('[data-testid="allow-project"]') as HTMLElement).click();
      expect(manage.allow).toHaveBeenCalledWith(expect.objectContaining({ id: 'b2' }), { project: 'mandarina' });
    });

    it('con la acción avisar no ofrece permitir', async () => {
      state$.next(loaded([sessionBudget({ action: 'warn' })]));
      const fixture = await expand('b2');
      expect(q(fixture, 'allow-session')).toBeNull();
      expect(q(fixture, 'allow-project')).toBeNull();
    });

    it('en el global del día se elige el Proyecto al que permitir seguir', async () => {
      state$.next(loaded([overGlobal()]));
      const fixture = await expand('b9');
      const button = q(fixture, 'allow-project') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      await select(fixture, 'allow-project-select', 'lucia');
      expect(button.disabled).toBe(false);
      button.click();
      expect(manage.allow).toHaveBeenCalledWith(expect.objectContaining({ id: 'b9' }), { project: 'lucia' });
    });

    it('un Presupuesto por Proyecto y día permite seguir a su Proyecto', async () => {
      state$.next(
        loaded([budget({ id: 'p1', scope: 'project_day', project: 'demo', state: 'exceeded', subjects: [budgetSubjectDto({ project: 'demo', state: 'exceeded', ratio: 1.2 })] })]),
      );
      const fixture = await expand('p1');
      (q(fixture, 'allow-project') as HTMLElement).click();
      expect(manage.allow).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), { project: 'demo' });
    });

    it('Ampliar el límite propone un valor por encima de lo gastado y lo aplica', async () => {
      const fixture = await expand('b2');
      const over = el(fixture).querySelector('[data-testid="budget-subject"]')!;
      (over.querySelector('[data-testid="raise-limit"]') as HTMLElement).click();
      await fixture.whenStable();
      const input = q(fixture, 'raise-input') as HTMLInputElement;
      // 9,50 $ gastados × 1,25 → 12.
      expect(input.value).toBe('12');
      await type(fixture, 'raise-input', '20');
      await click(fixture, 'raise-apply');
      expect(manage.raiseLimit).toHaveBeenCalledWith(expect.objectContaining({ id: 'b2' }), 20);
      expect(q(fixture, 'raise-input')).toBeNull();
    });

    it('no deja aplicar un límite que no vale', async () => {
      const fixture = await expand('b2');
      (q(fixture, 'raise-limit') as HTMLElement).click();
      await fixture.whenStable();
      await type(fixture, 'raise-input', 'nada');
      expect((q(fixture, 'raise-apply') as HTMLButtonElement).disabled).toBe(true);
    });

    it('lista las excepciones vigentes y se pueden quitar', async () => {
      const withAllowances = sessionBudget();
      withAllowances.allowances = [
        allowance({ id: 'a1' }),
        allowance({ id: 'a2', session_id: null, project: 'lucia', until: '2026-09-26T00:00:00.000Z' }),
      ];
      state$.next(loaded([withAllowances]));
      const fixture = await expand('b2');
      const rows = [...el(fixture).querySelectorAll('[data-testid="budget-allowance"]')];
      expect(text(rows[0]!)).toContain('Sesión 7f3c2a10, hasta que termine');
      expect(text(rows[1]!)).toContain('Proyecto lucia, hasta el fin del día');
      expect(text(el(fixture).querySelector('[data-testid="budget-allowances-count"]'))).toBe('2 excepciones');
      (rows[1]!.querySelector('[data-testid="allowance-remove"]') as HTMLElement).click();
      expect(manage.removeAllowance).toHaveBeenCalledWith(expect.objectContaining({ id: 'b2' }), expect.objectContaining({ id: 'a2' }));
    });

    it('un fallo de una acción se avisa sin romper la pantalla', async () => {
      manage.allow.mockReturnValue(of({ ok: false, message: 'Sin conexión con Mandarina' }));
      const fixture = await expand('b2');
      (q(fixture, 'allow-session') as HTMLElement).click();
      await fixture.whenStable();
      expect(text(q(fixture, 'budgets-action-error'))).toBe('Sin conexión con Mandarina');
    });
  });

  it('el interruptor Silenciar avisos de la pantalla comparte el estado con el aviso', async () => {
    const fixture = await render();
    (q(fixture, 'mute-switch') as HTMLElement).click();
    expect(sound.setMuted).toHaveBeenCalledWith(true);
    expect(budgetAllowanceDto().id).toBe('al1');
  });
});
