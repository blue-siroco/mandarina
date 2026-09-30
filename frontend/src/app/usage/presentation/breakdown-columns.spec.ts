import { breakdown, usageMetrics } from '../testing/usage-fixtures';
import { BreakdownRow, breakdownColumns, sortRows } from './breakdown-columns';

const total = (() => {
  const m = usageMetrics();
  return {
    sessions: { working: m.sessions.working, paused: m.sessions.paused, orphaned: m.sessions.orphaned },
    subagentsRunning: m.subagentsRunning,
    tokens: m.tokens,
    estimatedCostUsd: m.estimatedCostUsd,
    unpricedModels: m.unpricedModels,
    cache: m.cache,
  };
})();

// Intl separa la cifra de la unidad con un espacio duro.
const plain = (value: string) => value.replace(/\s/g, ' ');

describe('AC-40: columnas del desglose', () => {
  it.each([
    ['working', 'directory', ['Sesiones trabajando', 'Subagentes en marcha']],
    ['paused', 'directory', ['Sesiones en pausa', 'Huérfanas']],
    ['input', 'model', ['Entrada', 'Leído de caché', 'Escritos en caché']],
    ['cache', 'directory', ['Ahorro neto', 'Tasa de acierto', 'Leídos de caché', 'Escritos (5 min)', 'Escritos (1 h)', 'Ahorro bruto', 'Sobrecoste de escritura', 'Reescrituras']],
    ['output', 'directory', ['Salida', 'Modelo principal']],
    ['output', 'model', ['Salida']],
    ['cost', 'directory', ['Coste estimado', '% del total']],
    ['cost', 'model', ['Coste estimado', '% del total', 'Tarifa (entrada / salida, $/M)', 'Entrada', 'Salida', 'Lectura de caché', 'Escritura de caché']],
  ] as const)('la ficha %s por %s muestra sus columnas', (kpi, view, labels) => {
    expect(breakdownColumns(kpi, view).map((c) => c.label)).toStrictEqual(labels);
  });

  it('AC-135: el desglose ya no conoce la ficha Herramientas', () => {
    expect(() => breakdownColumns('tools' as never, 'model')).toThrow();
  });

  it('formatea cada cifra y marca como desconocido lo que no se sabe', () => {
    const [cost, share, rate, input] = breakdownColumns('cost', 'model');
    const [opus, , unknown] = breakdown().byModel;
    expect(plain(cost!.format(cost!.value(opus!, total)!))).toBe('~3,20 US$');
    expect(plain(share!.format(share!.value(opus!, total)!))).toBe('94 %');
    expect(rate!.value(opus!, total)).toBe('4 / 20');
    expect(rate!.value(unknown!, total)).toBeNull();
    expect(input!.value(unknown!, total)).toBeNull();
  });
});

describe('AC-40: orden del desglose', () => {
  const rows: BreakdownRow[] = breakdown().byModel;
  const [, subagents] = breakdownColumns('working', 'model');
  const [, , rate] = breakdownColumns('cost', 'model');

  it('ordena por la cifra en los dos sentidos sin tocar el original', () => {
    expect(sortRows(rows, subagents!, 'desc', total).map((r) => r.subagentsRunning)).toStrictEqual([3, 0, 0]);
    expect(sortRows(rows, subagents!, 'asc', total).map((r) => r.subagentsRunning)).toStrictEqual([0, 0, 3]);
    expect(rows.map((r) => r.subagentsRunning)).toStrictEqual([0, 3, 0]);
  });

  it('deja siempre al final lo desconocido', () => {
    expect(sortRows(rows, rate!, 'asc', total).map((r) => r.model)).toStrictEqual(['claude-haiku-4-5', 'claude-opus-5-5', null]);
    expect(sortRows(rows, rate!, 'desc', total).at(-1)!.model).toBeNull();
  });
});
