import { describe, expect, it } from 'vitest';
import { mergeReading, presentUsage, type StoredUsage } from '../src/domain/subscription-usage.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const epoch = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const IN_1H = '2026-09-25T13:00:00.000Z';
const IN_2D = '2026-09-27T12:00:00.000Z';

const usage = (five: number | null, seven: number | null, resets = { five: IN_1H, seven: IN_2D }): StoredUsage => ({
  five_hour: five === null ? null : { used_percent: five, resets_at: resets.five },
  seven_day: seven === null ? null : { used_percent: seven, resets_at: resets.seven },
  updated_at: NOW.toISOString(),
});

describe('presentUsage: remaining y status al consultar', () => {
  const statusOf = (used: number, resets = IN_1H) => presentUsage(usage(used, null, { five: resets, seven: IN_2D }), NOW).five_hour!;

  it('AC-129: remaining es 100 - usado', () => {
    expect(statusOf(23.5)).toMatchObject({ used_percent: 23.5, remaining_percent: 76.5, resets_at: IN_1H });
  });

  it('AC-129: comfortable por encima del 20 % restante', () => {
    expect(statusOf(79.9).status).toBe('comfortable');
    expect(statusOf(0).status).toBe('comfortable');
  });

  it('AC-129: near con el 20 % restante o menos (umbral inclusivo)', () => {
    expect(statusOf(80).status).toBe('near');
    expect(statusOf(99.9).status).toBe('near');
  });

  it('AC-129: exhausted cuando no queda nada', () => {
    expect(statusOf(100)).toMatchObject({ remaining_percent: 0, status: 'exhausted' });
  });

  it('AC-129: reset_pending si el reinicio ya pasó, gane lo que gane el porcentaje', () => {
    expect(statusOf(10, '2026-09-25T11:59:59.000Z').status).toBe('reset_pending');
    expect(statusOf(100, '2026-09-25T11:00:00.000Z').status).toBe('reset_pending');
    // Justo en el instante del reinicio ya cuenta como pasado.
    expect(statusOf(10, NOW.toISOString()).status).toBe('reset_pending');
  });

  it('AC-129: redondea a un decimal sin arrastrar coma flotante', () => {
    expect(statusOf(0.1 + 0.2)).toMatchObject({ used_percent: 0.3, remaining_percent: 99.7 });
    expect(statusOf(33.333)).toMatchObject({ used_percent: 33.3, remaining_percent: 66.7 });
    // 99,96 redondea a 100: no puede quedar "Cerca" con 0 restante.
    expect(statusOf(99.96)).toMatchObject({ used_percent: 100, remaining_percent: 0, status: 'exhausted' });
  });

  it('AC-129: acota a 0..100', () => {
    expect(statusOf(120)).toMatchObject({ used_percent: 100, remaining_percent: 0 });
    expect(statusOf(-5)).toMatchObject({ used_percent: 0, remaining_percent: 100 });
  });

  it('AC-129: las ventanas son independientes y una ausente es null', () => {
    const view = presentUsage(usage(50, null), NOW);
    expect(view.five_hour).not.toBeNull();
    expect(view.seven_day).toBeNull();
    expect(view.updated_at).toBe(NOW.toISOString());

    const stale = presentUsage(usage(50, 90, { five: '2026-09-25T10:00:00.000Z', seven: IN_2D }), NOW);
    expect(stale.five_hour!.status).toBe('reset_pending');
    expect(stale.seven_day!.status).toBe('near');
  });
});

describe('mergeReading: fusiona la lectura nueva con la guardada', () => {
  it('AC-129: convierte resets_at de epoch a ISO y estampa updated_at', () => {
    const merged = mergeReading(null, { five_hour: { used_percentage: 12, resets_at: epoch(IN_1H) } }, NOW);
    expect(merged).toEqual({
      five_hour: { used_percent: 12, resets_at: IN_1H },
      seven_day: null,
      updated_at: NOW.toISOString(),
    });
  });

  it('AC-129: una ventana presente sustituye a la anterior', () => {
    const previous = usage(10, 20);
    const merged = mergeReading(previous, { five_hour: { used_percentage: 30, resets_at: epoch(IN_1H) } }, NOW);
    expect(merged.five_hour).toEqual({ used_percent: 30, resets_at: IN_1H });
  });

  it('AC-129: una ventana ausente conserva la anterior si su reinicio sigue en el futuro', () => {
    const merged = mergeReading(usage(10, 20), { five_hour: { used_percentage: 30, resets_at: epoch(IN_1H) } }, NOW);
    expect(merged.seven_day).toEqual({ used_percent: 20, resets_at: IN_2D });
  });

  it('AC-129: una ventana ausente cuyo reinicio ya pasó no se conserva', () => {
    const previous = usage(10, 20, { five: '2026-09-25T11:00:00.000Z', seven: IN_2D });
    const merged = mergeReading(previous, { seven_day: { used_percentage: 25, resets_at: epoch(IN_2D) } }, NOW);
    expect(merged.five_hour).toBeNull();
    expect(merged.seven_day).toEqual({ used_percent: 25, resets_at: IN_2D });
  });
});
