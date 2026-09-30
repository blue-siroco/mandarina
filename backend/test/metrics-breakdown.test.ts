import { aggregate, type Contribution } from '../src/domain/metrics-breakdown.js';
import { costByClass, rateTable } from '../src/domain/pricing.js';
import { ZERO_USAGE } from '../src/domain/token-usage.js';

describe('AC-38: agregado de contribuciones', () => {
  const base: Omit<Contribution, 'model'> = { directory: '/a', project: 'demo', working: 0, paused: 0, orphaned: 0, subagents_running: 0 };

  it('suma Sesiones y tokens, y separa el coste de los modelos sin Tarifa', () => {
    const slice = aggregate([
      { ...base, model: 'claude-opus-5-5', working: 1, usage: { ...ZERO_USAGE, output: 1_000_000 } },
      { ...base, model: 'claude-opus-5-5', paused: 1, usage: { ...ZERO_USAGE, input: 1_000_000 } },
      { ...base, model: 'modelo-raro', usage: { ...ZERO_USAGE, output: 5 } },
      { ...base, model: null, orphaned: 1, subagents_running: 1 },
    ]);

    expect(slice).toMatchObject({
      sessions: { working: 1, paused: 1, orphaned: 1 },
      subagents_running: 1,
      estimated_cost_usd: 24,
      unpriced_models: ['modelo-raro'],
    });
    expect(slice.tokens).toMatchObject({ input: 1_000_000, output: 1_000_005 });
    expect(slice.main_model).toBe('claude-opus-5-5');
  });

  it('sin contribuciones es un corte vacío', () => {
    expect(aggregate([])).toMatchObject({ sessions: { working: 0, paused: 0, orphaned: 0 }, estimated_cost_usd: 0, main_model: null });
  });
});

describe('AC-38: Tarifa aplicada y coste por clase de token', () => {
  it('expone la Tarifa por millón con la escritura de caché de 5 min y 1 h', () => {
    expect(rateTable('claude-opus-5-5')).toStrictEqual({ input: 4, output: 20, cache_read: 0.2, cache_write_5m: 5, cache_write_1h: 8 });
    expect(rateTable('modelo-raro')).toBeNull();
  });

  it('reparte el coste entre entrada, salida, lectura y escritura de caché', () => {
    const usage = { input: 1_000_000, output: 1_000_000, cache_read: 1_000_000, cache_creation_5m: 1_000_000, cache_creation_1h: 1_000_000 };
    expect(costByClass('claude-opus-5-5', usage)).toStrictEqual({ input: 4, output: 20, cache_read: 0.2, cache_creation: 13 });
    expect(costByClass('modelo-raro', usage)).toBeNull();
  });
});
