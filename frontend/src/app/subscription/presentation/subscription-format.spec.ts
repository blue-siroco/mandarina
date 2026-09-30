import { UsageWindow } from '../models/subscription-usage';
import { countdown, effectiveStatus, resetLabel } from './subscription-format';

const NOW = new Date(2026, 8, 30, 17, 28, 0); // hora local: el formato también lo es
const window = (overrides: Partial<UsageWindow> = {}): UsageWindow => ({
  usedPercent: 38,
  remainingPercent: 62,
  resetsAt: new Date(NOW.getTime() + 72 * 60_000),
  status: 'comfortable',
  ...overrides,
});

describe('AC-138: cuenta atrás del reinicio', () => {
  it('hoy dice la hora local y lo que falta', () => {
    expect(resetLabel(new Date(2026, 8, 30, 18, 40), NOW)).toBe('se reinicia a las 18:40 · en 1 h 12 min');
  });

  it('otro día añade el día y cuenta en días', () => {
    const label = resetLabel(new Date(2026, 9, 3, 22, 28), NOW);
    expect(label).toMatch(/^se reinicia el \S+ 3 a las 22:28 · en 3 d 5 h$/);
  });

  it('por debajo del minuto no cuenta segundos', () => {
    expect(countdown(30_000)).toBe('menos de 1 min');
    expect(countdown(5 * 60_000)).toBe('5 min');
  });

  it('un reinicio pasado, aunque el servidor no lo sepa, es reset_pending', () => {
    expect(effectiveStatus(window(), NOW)).toBe('comfortable');
    expect(effectiveStatus(window({ status: 'near' }), NOW)).toBe('near');
    expect(effectiveStatus(window({ resetsAt: new Date(NOW.getTime() - 1) }), NOW)).toBe('reset_pending');
    expect(effectiveStatus(window({ status: 'reset_pending' }), NOW)).toBe('reset_pending');
  });
});
