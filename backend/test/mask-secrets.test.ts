import { readFileSync } from 'node:fs';
import { PII_CATEGORIES, maskSecrets, piiFromEnv, type PiiCategory } from '../src/domain/mask-secrets.js';

interface TextCase {
  name: string;
  input: string;
  expected: string;
  pii?: 'none' | PiiCategory[];
}

interface JsonCase {
  name: string;
  input: unknown;
  expected: unknown;
}

// Las mismas fixtures las ejecuta el Adaptador (adapters/claude-code/test/mask.test.mjs).
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/masking.json', import.meta.url), 'utf8')) as {
  text: TextCase[];
  json: JsonCase[];
};

const piiOf = (c: TextCase): PiiCategory[] => (c.pii === undefined ? [...PII_CATEGORIES] : c.pii === 'none' ? [] : c.pii);

describe('AC-60, AC-61: maskSecrets con las fixtures compartidas', () => {
  it.each(fixtures.text.map((c) => [c.name, c] as const))('texto: %s', (_name, c) => {
    expect(maskSecrets(c.input, { pii: piiOf(c) })).toBe(c.expected);
  });

  it.each(fixtures.json.map((c) => [c.name, c] as const))('JSON: %s', (_name, c) => {
    expect(maskSecrets(c.input, { pii: [...PII_CATEGORIES] })).toStrictEqual(c.expected);
  });

  it('enmascarar dos veces da el mismo resultado', () => {
    for (const c of fixtures.text) {
      const once = maskSecrets(c.input, { pii: piiOf(c) });
      expect(maskSecrets(once, { pii: piiOf(c) }), c.name).toBe(once);
    }
    for (const c of fixtures.json) {
      const once = maskSecrets(c.input, { pii: [...PII_CATEGORIES] });
      expect(maskSecrets(once, { pii: [...PII_CATEGORIES] }), c.name).toStrictEqual(once);
    }
  });

  it('el valor original no queda en ningún sitio', () => {
    const secrets = ['sk-ant-api03-abcdefghijklmnop', 'supersecreto', 's3cr3t', 'hunter2', 'MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn'];
    const masked = maskSecrets({ a: `x ${secrets[0]} y`, b: `API_KEY=${secrets[1]}`, c: `postgres://u:${secrets[2]}@h/d`, d: `DB_PASSWORD: ${secrets[3]}`, e: `-----BEGIN PRIVATE KEY-----\n${secrets[4]}\n-----END PRIVATE KEY-----` });
    for (const secret of secrets) expect(JSON.stringify(masked)).not.toContain(secret);
  });

  it('no muta la entrada', () => {
    const input = { password: 'x', nested: { text: 'ana@example.com' } };
    maskSecrets(input, { pii: [...PII_CATEGORIES] });
    expect(input).toStrictEqual({ password: 'x', nested: { text: 'ana@example.com' } });
  });
});

describe('AC-61: MANDARINA_MASK_PII', () => {
  it.each([
    [{}, [...PII_CATEGORIES]],
    [{ MANDARINA_MASK_PII: '' }, [...PII_CATEGORIES]],
    [{ MANDARINA_MASK_PII: 'all' }, [...PII_CATEGORIES]],
    [{ MANDARINA_MASK_PII: 'none' }, []],
    [{ MANDARINA_MASK_PII: ' Email , id ' }, ['email', 'id']],
    [{ MANDARINA_MASK_PII: 'email,desconocida' }, ['email']],
  ])('%j → %j', (env, categories) => {
    expect(piiFromEnv(env)).toStrictEqual(categories);
  });

  it('maskSecrets sin opciones usa el entorno del proceso', () => {
    const previous = process.env.MANDARINA_MASK_PII;
    try {
      process.env.MANDARINA_MASK_PII = 'none';
      expect(maskSecrets('ana@example.com')).toBe('ana@example.com');
      process.env.MANDARINA_MASK_PII = 'email';
      expect(maskSecrets('ana@example.com')).toBe('[REDACTED_EMAIL]');
    } finally {
      if (previous === undefined) delete process.env.MANDARINA_MASK_PII;
      else process.env.MANDARINA_MASK_PII = previous;
    }
  });
});
