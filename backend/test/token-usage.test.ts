import { estimateCost, rateFor } from '../src/domain/pricing.js';
import { parseUsageEntries, usageByModel, type TokenUsage } from '../src/domain/token-usage.js';

const line = (id: string, usage: Record<string, unknown>, overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-09-25T10:00:00.000Z',
    message: { id, model: 'claude-opus-5-5', role: 'assistant', usage },
    ...overrides,
  });

const usage = (overrides: Partial<TokenUsage> = {}): TokenUsage => ({
  input: 0,
  output: 0,
  cache_read: 0,
  cache_creation_5m: 0,
  cache_creation_1h: 0,
  ...overrides,
});

describe('AC-12: parseUsageEntries', () => {
  it('cuenta una sola vez la respuesta repetida en varias líneas y se queda con la última', () => {
    const jsonl = [
      line('msg-1', { input_tokens: 2, output_tokens: 4 }),
      line('msg-1', { input_tokens: 2, output_tokens: 90 }),
    ].join('\n');

    const entries = parseUsageEntries(jsonl);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.usage).toEqual(usage({ input: 2, output: 90 }));
  });

  it('separa la escritura de caché de 1 h de la de 5 min', () => {
    const [entry] = parseUsageEntries(
      line('m', {
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 7,
        cache_creation: { ephemeral_5m_input_tokens: 40, ephemeral_1h_input_tokens: 60 },
      }),
    );
    expect(entry?.usage).toEqual(usage({ cache_read: 7, cache_creation_5m: 40, cache_creation_1h: 60 }));
  });

  it('ignora líneas ilegibles, de usuario, sin usage y del modelo sintético', () => {
    const jsonl = [
      '{"type":"assistant","message":{"usage"', // línea a medio escribir
      JSON.stringify({ type: 'user', message: { usage: {} } }),
      line('synthetic', { output_tokens: 5 }, { message: { id: 's', model: '<synthetic>', usage: { output_tokens: 5 } } }),
      line('ok', { output_tokens: 1 }),
    ].join('\n');

    expect(parseUsageEntries(jsonl).map((e) => e.messageId)).toEqual(['ok']);
  });
});

describe('AC-12: usageByModel', () => {
  const entry = (messageId: string, model: string, timestamp: string, output: number) => ({
    messageId,
    model,
    timestamp,
    usage: usage({ output }),
  });

  it('suma por modelo desde `since` sin repetir respuestas presentes en dos Transcripts', () => {
    const totals = usageByModel(
      [
        entry('a', 'claude-opus-5-5', '2026-09-24T23:59:59.000Z', 1000),
        entry('b', 'claude-opus-5-5', '2026-09-25T08:00:00.000Z', 10),
        entry('b', 'claude-opus-5-5', '2026-09-25T08:00:00.000Z', 10),
        entry('c', 'claude-haiku-4-5', '2026-09-25T09:00:00.000Z', 3),
      ],
      new Date('2026-09-25T00:00:00.000Z'),
    );

    expect(Object.fromEntries([...totals].map(([model, u]) => [model, u.output]))).toEqual({
      'claude-opus-5-5': 10,
      'claude-haiku-4-5': 3,
    });
  });
});

describe('AC-12: Tarifas (ADR-0005)', () => {
  it('casa ids con sufijo de fecha por el prefijo más largo', () => {
    expect(rateFor('claude-opus-5-5')?.input).toBe(4);
    expect(rateFor('claude-opus-5')?.input).toBe(5);
    expect(rateFor('claude-opus-4-20250514')?.input).toBe(15);
    expect(rateFor('claude-haiku-4-5-20251001')?.input).toBe(1);
  });

  it('estima el coste de cada clase de token', () => {
    // 1M de cada clase con Sonnet 5: 2 + 10 + 0,2 + 2×1,25 + 2×2
    const cost = estimateCost(
      'claude-sonnet-5',
      usage({ input: 1e6, output: 1e6, cache_read: 1e6, cache_creation_5m: 1e6, cache_creation_1h: 1e6 }),
    );
    expect(cost).toBeCloseTo(18.7, 6);
  });

  it('no inventa coste para un modelo sin Tarifa', () => {
    expect(estimateCost('gpt-5', usage({ input: 1e6 }))).toBeUndefined();
  });
});
