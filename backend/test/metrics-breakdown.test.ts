import { aggregate, modelAt, type Contribution } from '../src/domain/metrics-breakdown.js';
import { costByClass, rateTable } from '../src/domain/pricing.js';
import { ZERO_USAGE, type UsageEntry } from '../src/domain/token-usage.js';

const entry = (messageId: string, model: string, timestamp: string, output = 100): UsageEntry => ({
  messageId,
  model,
  timestamp,
  usage: { ...ZERO_USAGE, input: 10, output },
});

describe('AC-38: modelo en uso en un momento', () => {
  const entries = [
    entry('m2', 'claude-opus-5-5', '2026-09-25T10:05:00.000Z'),
    entry('m1', 'claude-sonnet-5', '2026-09-25T10:00:00.000Z'),
  ];

  it('es el de la respuesta anterior, sin importar el orden del Transcript', () => {
    expect(modelAt(entries, '2026-09-25T10:03:00.000Z')).toBe('claude-sonnet-5');
    expect(modelAt(entries, '2026-09-25T10:05:00.000Z')).toBe('claude-opus-5-5');
    expect(modelAt(entries, '2026-09-25T11:00:00.000Z')).toBe('claude-opus-5-5');
  });

  it('antes de la primera respuesta es el de la siguiente, y sin respuestas es desconocido', () => {
    expect(modelAt(entries, '2026-09-25T09:00:00.000Z')).toBe('claude-sonnet-5');
    expect(modelAt([], '2026-09-25T09:00:00.000Z')).toBeNull();
  });
});

describe('AC-38: agregado de contribuciones', () => {
  const base: Omit<Contribution, 'model'> = { directory: '/a', project: 'demo', working: 0, paused: 0, orphaned: 0, subagents_running: 0, tool_calls: 0, prompts: 0, blocks: 0 };

  it('suma conteos y tokens, y separa el coste de los modelos sin Tarifa', () => {
    const slice = aggregate([
      { ...base, model: 'claude-opus-5-5', working: 1, tool_calls: 2, usage: { ...ZERO_USAGE, output: 1_000_000 } },
      { ...base, model: 'claude-opus-5-5', paused: 1, prompts: 1, usage: { ...ZERO_USAGE, input: 1_000_000 } },
      { ...base, model: 'modelo-raro', blocks: 1, usage: { ...ZERO_USAGE, output: 5 } },
      { ...base, model: null, orphaned: 1, subagents_running: 1 },
    ]);

    expect(slice).toMatchObject({
      sessions: { working: 1, paused: 1, orphaned: 1 },
      subagents_running: 1,
      activity: { tool_calls: 2, prompts: 1, blocks: 1 },
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
