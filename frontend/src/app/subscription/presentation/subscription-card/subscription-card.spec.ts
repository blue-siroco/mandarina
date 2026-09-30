import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import {
  INITIAL_SUBSCRIPTION_STATE,
  SubscriptionUsageState,
  WatchSubscriptionUsage,
} from '../../application/watch-subscription-usage';
import { NOW, subscriptionUsage, windowDto } from '../../testing/subscription-fixtures';
import { EMPTY_HELP, HELP_TEXT, SUBSCRIPTION_TICK_MS, SubscriptionCard } from './subscription-card';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

describe('AC-137, AC-138: SubscriptionCard', () => {
  let state$: BehaviorSubject<SubscriptionUsageState>;

  async function render() {
    await TestBed.configureTestingModule({
      imports: [SubscriptionCard],
      providers: [{ provide: WatchSubscriptionUsage, useValue: { state$ } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(SubscriptionCard);
    await fixture.whenStable();
    return fixture;
  }

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const meter = (fixture: { nativeElement: unknown }, window: 'five-hour' | 'seven-day') =>
    el(fixture).querySelector(`[data-testid="subscription-meter"][data-window="${window}"]`);
  const load = (overrides: Parameters<typeof subscriptionUsage>[0] = {}) =>
    state$.next({ usage: subscriptionUsage(overrides), loaded: true, failed: false });

  beforeEach(() => {
    // Solo el reloj: el resto de temporizadores de Angular siguen reales.
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    state$ = new BehaviorSubject<SubscriptionUsageState>(INITIAL_SUBSCRIPTION_STATE);
  });
  afterEach(() => vi.useRealTimers());

  it('AC-137: sin suscripción (usage null) no pinta la ficha', async () => {
    state$.next({ usage: null, loaded: true, failed: false });
    const fixture = await render();
    expect(el(fixture).querySelector('[data-testid="subscription-meter"]')).toBeNull();
    expect(el(fixture).querySelector('[data-testid="meter-used"]')).toBeNull();
  });

  it('AC-140: antes de la primera respuesta no pinta nada', async () => {
    const fixture = await render();
    expect(text(el(fixture))).toBe('');
  });

  it('AC-140: sin lectura pinta una línea de "sin datos" con la explicación de los dos casos', async () => {
    state$.next({ usage: null, loaded: true, failed: false });
    const empty = el(await render()).querySelector('[data-testid="subscription-empty"]')!;
    expect(text(empty.querySelector('summary'))).toBe('Uso de la suscripción: sin datos');
    const explanation = text(empty.querySelector('[data-testid="subscription-empty-help"]'));
    expect(explanation).toBe(EMPTY_HELP.join(' '));
    expect(explanation).toContain('API key');
    expect(explanation).toContain('statusline.mjs');
  });

  it('AC-140: sin ninguna ventana también pinta la línea, y con datos no', async () => {
    load({ five_hour: null, seven_day: null });
    expect(el(await render()).querySelector('[data-testid="subscription-empty"]')).not.toBeNull();
    TestBed.resetTestingModule();
    load();
    expect(el(await render()).querySelector('[data-testid="subscription-empty"]')).toBeNull();
  });

  it('AC-140: un fallo de red sin lectura previa no pinta la línea', async () => {
    state$.next({ usage: null, loaded: true, failed: true });
    expect(el(await render()).querySelector('[data-testid="subscription-empty"]')).toBeNull();
  });

  it('AC-140: un mensaje con usage null cambia la ficha por la línea', async () => {
    load();
    const fixture = await render();
    state$.next({ usage: null, loaded: true, failed: false });
    await fixture.whenStable();
    expect(el(fixture).querySelector('[data-testid="subscription-meter"]')).toBeNull();
    expect(el(fixture).querySelector('[data-testid="subscription-empty"]')).not.toBeNull();
  });

  it('AC-137: con datos pinta dos medidores con lo consumido, no lo pendiente', async () => {
    load();
    const fixture = await render();
    const five = meter(fixture, 'five-hour')!;
    const seven = meter(fixture, 'seven-day')!;

    expect(text(five.querySelector('h3'))).toContain('Sesión (5 h)');
    expect(text(five.querySelector('[data-testid="meter-used"]'))).toBe('38 %');
    expect(text(five)).toContain('usado');
    expect(text(seven.querySelector('h3'))).toContain('Semanal (7 d)');
    expect(text(seven.querySelector('[data-testid="meter-used"]'))).toBe('60 %');
  });

  it('AC-137: la barra es accesible y su valor es el % pendiente', async () => {
    load();
    const bar = meter(await render(), 'five-hour')!.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('38');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-label')).toContain('Sesión (5 h)');
  });

  it.each([
    ['comfortable', 62, 'Holgado'],
    ['near', 15, 'Cerca'],
    ['exhausted', 0, 'Agotado'],
  ] as const)('AC-137: el estado %s se dice con texto (%s)', async (status, remaining, label) => {
    load({ five_hour: windowDto({ status, remaining_percent: remaining, used_percent: 100 - remaining }) });
    const five = meter(await render(), 'five-hour')!;
    expect(text(five.querySelector('[data-testid="meter-state"]'))).toBe(label);
    expect(five.getAttribute('data-status')).toBe(status);
  });

  it('AC-137: una ventana ausente no se pinta', async () => {
    load({ seven_day: null });
    const fixture = await render();
    expect(meter(fixture, 'five-hour')).not.toBeNull();
    expect(meter(fixture, 'seven-day')).toBeNull();
  });

  it('AC-137: sin ninguna ventana no hay ficha', async () => {
    load({ five_hour: null, seven_day: null });
    expect(el(await render()).querySelector('[data-testid="subscription-meter"]')).toBeNull();
  });

  it('AC-138: dice cuándo se reinicia en hora local y cuánto falta, en días si pasa de 24 h', async () => {
    load();
    const fixture = await render();
    const five = text(meter(fixture, 'five-hour')!.querySelector('[data-testid="meter-reset"]'));
    expect(five).toBe(`se reinicia a las ${hhmm(windowDto().resets_at)} · en 1 h 12 min`);
    expect(text(meter(fixture, 'seven-day')!.querySelector('[data-testid="meter-reset"]'))).toMatch(/ · en 3 d 5 h$/);
  });

  it('AC-138: la cuenta atrás avanza con el reloj y no se pinta "Actualizado hace"', async () => {
    load();
    const fixture = await render();
    expect(el(fixture).querySelector('[data-testid="subscription-updated"]')).toBeNull();

    vi.setSystemTime(new Date(NOW.getTime() + 11 * 60_000));
    vi.advanceTimersByTime(SUBSCRIPTION_TICK_MS);
    await fixture.whenStable();

    expect(text(meter(fixture, 'five-hour')!.querySelector('[data-testid="meter-reset"]'))).toMatch(/ · en 1 h$/);
  });

  it('AC-138: reset_pending no enseña el % antiguo ni la barra', async () => {
    load({ five_hour: windowDto({ status: 'reset_pending', remaining_percent: 0, used_percent: 100 }) });
    const five = meter(await render(), 'five-hour')!;
    expect(text(five.querySelector('[data-testid="meter-pending"]'))).toBe('Ventana reiniciada, pendiente de nueva lectura');
    expect(five.querySelector('[data-testid="meter-used"]')).toBeNull();
    expect(five.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('AC-138: al pasar la hora de reinicio la ventana pasa a reiniciada sin esperar otra lectura', async () => {
    load();
    const fixture = await render();
    expect(meter(fixture, 'five-hour')!.querySelector('[role="progressbar"]')).not.toBeNull();

    vi.setSystemTime(new Date(NOW.getTime() + 73 * 60_000));
    vi.advanceTimersByTime(SUBSCRIPTION_TICK_MS);
    await fixture.whenStable();

    expect(meter(fixture, 'five-hour')!.querySelector('[data-testid="meter-pending"]')).not.toBeNull();
    expect(meter(fixture, 'seven-day')!.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it('AC-139: una ayuda explica que es de la cuenta y que solo aparece con suscripción', async () => {
    load();
    const help = el(await render()).querySelector('[data-testid="subscription-help"]')!;
    expect(help.getAttribute('title')).toBe(HELP_TEXT);
    expect(HELP_TEXT).toContain('compartido entre todas las Sesiones');
    expect(HELP_TEXT).toContain('suscripción');
    expect(help.getAttribute('aria-label')).toContain(HELP_TEXT);
  });

  it('AC-137: un mensaje nuevo actualiza el %', async () => {
    load();
    const fixture = await render();
    load({ five_hour: windowDto({ remaining_percent: 9, used_percent: 91, status: 'near' }) });
    await fixture.whenStable();
    expect(text(meter(fixture, 'five-hour')!.querySelector('[data-testid="meter-used"]'))).toBe('91 %');
  });
});
