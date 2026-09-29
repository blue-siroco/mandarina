import { budgetState, endOfLocalDay, normalizeBudget, startOfLocalDay, stopReason } from '../src/domain/budget.js';

describe('AC-76: normalizeBudget', () => {
  const ok = (input: unknown) => {
    const result = normalizeBudget(input);
    if (!result.ok) throw new Error(result.message);
    return result.value;
  };
  const fail = (input: unknown) => {
    const result = normalizeBudget(input);
    if (result.ok) throw new Error('debía ser inválido');
    return result.message;
  };

  it('aplica los valores por defecto: umbral 80 %, detener y activo', () => {
    expect(ok({ scope: 'global_day', limit_usd: 50 })).toStrictEqual({
      scope: 'global_day',
      project: null,
      limit_usd: 50,
      warn_ratio: 0.8,
      action: 'stop',
      enabled: true,
    });
  });

  it('acepta todos los campos', () => {
    expect(ok({ scope: 'project_day', project: 'mandarina', limit_usd: 12.5, warn_ratio: 0.5, action: 'warn', enabled: false })).toStrictEqual({
      scope: 'project_day',
      project: 'mandarina',
      limit_usd: 12.5,
      warn_ratio: 0.5,
      action: 'warn',
      enabled: false,
    });
  });

  it('por Sesión el Proyecto es opcional', () => {
    expect(ok({ scope: 'session', limit_usd: 5 }).project).toBeNull();
    expect(ok({ scope: 'session', project: 'demo', limit_usd: 5 }).project).toBe('demo');
    expect(ok({ scope: 'session', project: '  ', limit_usd: 5 }).project).toBeNull();
  });

  it('exige el Proyecto en project_day y lo prohíbe en global_day', () => {
    expect(fail({ scope: 'project_day', limit_usd: 5 })).toMatch(/Proyecto/);
    expect(fail({ scope: 'project_day', project: ' ', limit_usd: 5 })).toMatch(/Proyecto/);
    expect(fail({ scope: 'global_day', project: 'demo', limit_usd: 5 })).toMatch(/Proyecto/);
  });

  it.each([0, -1, '5', null, Number.NaN, Number.POSITIVE_INFINITY])('rechaza el límite %j', (limit) => {
    expect(fail({ scope: 'global_day', limit_usd: limit })).toMatch(/límite/);
  });

  it.each([0, -0.1, 1.01, '0.8', null])('rechaza el umbral %j', (warn) => {
    expect(fail({ scope: 'global_day', limit_usd: 5, warn_ratio: warn })).toMatch(/umbral/);
  });

  it('acepta un umbral de exactamente 1', () => {
    expect(ok({ scope: 'global_day', limit_usd: 5, warn_ratio: 1 }).warn_ratio).toBe(1);
  });

  it('rechaza un ámbito, una acción o un activo desconocidos y un cuerpo que no es un objeto', () => {
    expect(fail({ scope: 'week', limit_usd: 5 })).toMatch(/ámbito/);
    expect(fail({ scope: 'global_day', limit_usd: 5, action: 'kill' })).toMatch(/acción/);
    expect(fail({ scope: 'global_day', limit_usd: 5, enabled: 'yes' })).toMatch(/activo/);
    expect(fail(null)).toMatch(/objeto/);
    expect(fail([])).toMatch(/objeto/);
  });
});

describe('AC-77: budgetState', () => {
  it.each([
    [0, 'within'],
    [3.99, 'within'],
    [4, 'near'],
    [5, 'near'],
    [5.01, 'exceeded'],
    [50, 'exceeded'],
  ] as const)('con límite 5 y umbral 0,8, %d es %s', (spent, state) => {
    expect(budgetState(spent, 5, 0.8)).toBe(state);
  });

  it('con umbral 1 no hay Cerca: pasa de Dentro a Superado', () => {
    expect(budgetState(5, 5, 1)).toBe('near');
    expect(budgetState(4.99, 5, 1)).toBe('within');
  });
});

describe('AC-77: el día natural', () => {
  it('va de las 00:00 locales a las 00:00 del día siguiente', () => {
    const now = new Date(2026, 8, 25, 18, 42, 7);
    const start = startOfLocalDay(now);
    const end = endOfLocalDay(now);
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours(), start.getMinutes()]).toStrictEqual([2026, 8, 25, 0, 0]);
    expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours()]).toStrictEqual([2026, 8, 26, 0]);
  });

  it('el fin del último día del mes cae en el primero del siguiente', () => {
    const end = endOfLocalDay(new Date(2026, 8, 30, 23, 59));
    expect([end.getMonth(), end.getDate()]).toStrictEqual([9, 1]);
  });
});

describe('AC-79: stopReason', () => {
  it('nombra el Presupuesto, lo gastado y el límite, y dice cómo seguir', () => {
    expect(stopReason({ scope: 'session', project: null }, 5, 5.2)).toBe(
      'Presupuesto por Sesión superado: ~$5,20 de ~$5,00. Amplía el límite o permite seguir en Mandarina (/presupuestos).',
    );
    expect(stopReason({ scope: 'project_day', project: 'mandarina' }, 12, 30)).toContain('Presupuesto de mandarina del día superado: ~$30,00 de ~$12,00');
    expect(stopReason({ scope: 'global_day', project: null }, 50, 50.004)).toContain('Presupuesto global del día superado: ~$50,00 de ~$50,00');
  });
});
