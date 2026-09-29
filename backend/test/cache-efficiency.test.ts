import { cacheEfficiency, cacheRewrites } from '../src/domain/cache-efficiency.js';
import type { TokenUsage, UsageEntry } from '../src/domain/token-usage.js';

const usage = (overrides: Partial<TokenUsage> = {}): TokenUsage => ({
  input: 0,
  output: 0,
  cache_read: 0,
  cache_creation_5m: 0,
  cache_creation_1h: 0,
  ...overrides,
});

const T0 = Date.parse('2026-09-25T12:00:00.000Z');
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

function entry(id: string, minutes: number, u: Partial<TokenUsage>, model = 'claude-sonnet-5'): UsageEntry {
  return { messageId: id, model, timestamp: at(minutes), usage: usage(u) };
}

describe('AC-69: cacheEfficiency', () => {
  it('la tasa de acierto es lo leído de caché entre toda la entrada', () => {
    const stats = cacheEfficiency(new Map([['claude-sonnet-5', usage({ input: 100, cache_read: 800, cache_creation_5m: 60, cache_creation_1h: 40 })]]));
    expect(stats.hit_rate).toBeCloseTo(0.8, 10);
    expect(stats).toMatchObject({ read_tokens: 800, write_5m_tokens: 60, write_1h_tokens: 40 });
  });

  it('sin tokens de entrada la tasa es null', () => {
    expect(cacheEfficiency(new Map()).hit_rate).toBeNull();
    expect(cacheEfficiency(new Map([['claude-sonnet-5', usage({ output: 50 })]])).hit_rate).toBeNull();
  });

  it('el ahorro bruto ahorra la diferencia entre entrada y lectura de caché', () => {
    // Sonnet 5: entrada 2 $/M y lectura 0,2 $/M → 1 M de tokens leídos ahorra 1,8 $.
    const stats = cacheEfficiency(new Map([['claude-sonnet-5', usage({ cache_read: 1_000_000 })]]));
    expect(stats.savings_gross_usd).toBeCloseTo(1.8, 6);
    expect(stats.write_overhead_usd).toBe(0);
    expect(stats.savings_net_usd).toBeCloseTo(1.8, 6);
  });

  it('escribir en caché cuesta 0,25× la entrada con TTL de 5 min y 1× con 1 h', () => {
    const stats = cacheEfficiency(new Map([['claude-sonnet-5', usage({ cache_creation_5m: 1_000_000, cache_creation_1h: 1_000_000 })]]));
    expect(stats.write_overhead_usd).toBeCloseTo(2 * 0.25 + 2 * 1, 6);
  });

  it('el ahorro neto resta el sobrecoste y puede ser negativo', () => {
    const positive = cacheEfficiency(new Map([['claude-sonnet-5', usage({ cache_read: 1_000_000, cache_creation_5m: 1_000_000 })]]));
    expect(positive.savings_net_usd).toBeCloseTo(1.8 - 0.5, 6);
    const negative = cacheEfficiency(new Map([['claude-sonnet-5', usage({ cache_read: 100_000, cache_creation_1h: 1_000_000 })]]));
    expect(negative.savings_net_usd).toBeCloseTo(0.18 - 2, 6);
    expect(negative.savings_net_usd).toBeLessThan(0);
  });

  it('suma varios modelos con su Tarifa y aparta los que no la tienen', () => {
    const stats = cacheEfficiency(
      new Map([
        ['claude-sonnet-5', usage({ cache_read: 1_000_000 })],
        ['claude-haiku-4-5', usage({ cache_read: 1_000_000 })],
        ['mystery-model', usage({ input: 500_000, cache_read: 500_000, cache_creation_5m: 1_000_000 })],
      ]),
    );
    // Haiku 4.5: 1 - 0,1 = 0,9 $/M.
    expect(stats.savings_gross_usd).toBeCloseTo(1.8 + 0.9, 6);
    expect(stats.unpriced_models).toStrictEqual(['mystery-model']);
    // Los tokens del modelo sin Tarifa sí cuentan en la tasa de acierto.
    expect(stats.hit_rate).toBeCloseTo(2_500_000 / (2_500_000 + 500_000 + 1_000_000), 10);
    expect(stats.read_tokens).toBe(2_500_000);
  });

  it('lleva las Reescrituras que se le pasan, con su coste', () => {
    const stats = cacheEfficiency(new Map([['claude-sonnet-5', usage({ cache_read: 10 })]]), { count: 2, cost_usd: 0.1234567 });
    expect(stats).toMatchObject({ rewrites: 2, rewrite_cost_usd: 0.123457 });
    expect(cacheEfficiency(new Map()).rewrites).toBe(0);
  });

  it('redondea los importes a 6 decimales', () => {
    const stats = cacheEfficiency(new Map([['claude-sonnet-5', usage({ cache_read: 1234567 })]]));
    expect(stats.savings_gross_usd).toBe(Math.round(stats.savings_gross_usd * 1e6) / 1e6);
  });
});

describe('AC-70: cacheRewrites', () => {
  // Una respuesta que lee su contexto de caché.
  const reads = (id: string, minutes: number, model?: string) => entry(id, minutes, { input: 50, cache_read: 9000, cache_creation_5m: 100 }, model);

  it('la primera respuesta de un agente nunca es una Reescritura', () => {
    expect(cacheRewrites([entry('m1', 0, { input: 10, cache_creation_5m: 9000 })], null)).toStrictEqual([]);
  });

  it('una respuesta que lee su contexto no lo es', () => {
    expect(cacheRewrites([reads('m1', 0), reads('m2', 1), reads('m3', 2)], null)).toStrictEqual([]);
  });

  it('lo es si escribe más de la mitad de su entrada, con su coste y el tiempo desde la anterior', () => {
    const rewrites = cacheRewrites([reads('m1', 0), entry('m2', 3, { input: 100, cache_read: 1000, cache_creation_5m: 1_000_000 })], null);
    expect(rewrites).toHaveLength(1);
    expect(rewrites[0]).toMatchObject({
      message_id: 'm2',
      subagent_id: null,
      occurred_at: at(3),
      model: 'claude-sonnet-5',
      written_tokens: 1_000_000,
      gap_ms: 3 * 60_000,
    });
    // Sonnet 5: 1 M de tokens a 1,25 × 2 $/M.
    expect(rewrites[0]!.cost_usd).toBeCloseTo(2.5, 6);
  });

  it('exactamente la mitad no es una Reescritura', () => {
    expect(cacheRewrites([reads('m1', 0), entry('m2', 1, { input: 0, cache_read: 500, cache_creation_5m: 500 })], null)).toStrictEqual([]);
    expect(cacheRewrites([reads('m1', 0), entry('m2', 1, { input: 0, cache_read: 499, cache_creation_5m: 501 })], null)).toHaveLength(1);
  });

  it.each([
    ['expired', reads('m1', 0), entry('m2', 6, { cache_creation_5m: 9000 })],
    ['other', reads('m1', 0), entry('m2', 4, { cache_creation_5m: 9000 })],
    ['model_change', reads('m1', 0, 'claude-opus-5-5'), entry('m2', 1, { cache_creation_5m: 9000 })],
    ['other', reads('m1', 0), entry('m2', 30, { cache_creation_1h: 9000 })],
    ['expired', reads('m1', 0), entry('m2', 61, { cache_creation_1h: 9000 })],
  ] as const)('la causa es %s', (cause, previous, current) => {
    expect(cacheRewrites([previous, current], null)[0]?.cause).toBe(cause);
  });

  it('con escritura de ambos TTL manda la clase con más tokens', () => {
    const rewrites = cacheRewrites([reads('m1', 0), entry('m2', 10, { cache_creation_5m: 3000, cache_creation_1h: 6000 })], null);
    expect(rewrites[0]?.cause).toBe('other');
  });

  it('un modelo sin Tarifa no da coste', () => {
    const rewrites = cacheRewrites([reads('m1', 0, 'mystery'), entry('m2', 10, { cache_creation_5m: 9000 }, 'mystery')], null);
    expect(rewrites[0]).toMatchObject({ cause: 'expired', cost_usd: null });
  });

  it('ordena por hora aunque el Transcript no lo esté y cuenta una vez las respuestas repetidas', () => {
    const rewrites = cacheRewrites(
      [entry('m2', 10, { cache_creation_5m: 9000 }), reads('m1', 0), entry('m2', 10, { cache_creation_5m: 9000 })],
      null,
    );
    expect(rewrites.map((r) => r.message_id)).toStrictEqual(['m2']);
  });

  it('anota el agente en el que ocurre', () => {
    expect(cacheRewrites([reads('m1', 0), entry('m2', 10, { cache_creation_5m: 9000 })], 'agent-a1')[0]?.subagent_id).toBe('agent-a1');
  });
});
