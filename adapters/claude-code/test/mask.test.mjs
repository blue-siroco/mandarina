import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PII_CATEGORIES, maskEvent, maskSecrets, piiFromEnv } from '../lib/mask.mjs';

// Las mismas fixtures las ejecuta el backend (backend/test/mask-secrets.test.ts).
const fixturesUrl = new URL('./fixtures/masking.json', import.meta.url);
const fixtures = JSON.parse(readFileSync(fixturesUrl, 'utf8'));

const piiOf = (c) => (c.pii === undefined ? [...PII_CATEGORIES] : c.pii === 'none' ? [] : c.pii);

for (const c of fixtures.text) {
  test(`AC-60, AC-61: texto — ${c.name}`, () => {
    assert.equal(maskSecrets(c.input, { pii: piiOf(c) }), c.expected);
  });
}

for (const c of fixtures.json) {
  test(`AC-60, AC-61: JSON — ${c.name}`, () => {
    assert.deepEqual(maskSecrets(c.input, { pii: [...PII_CATEGORIES] }), c.expected);
  });
}

test('AC-60: enmascarar dos veces da el mismo resultado', () => {
  for (const c of fixtures.text) {
    const once = maskSecrets(c.input, { pii: piiOf(c) });
    assert.equal(maskSecrets(once, { pii: piiOf(c) }), once, c.name);
  }
});

test('AC-62: las fixtures del Adaptador y las del backend son idénticas', () => {
  const backend = readFileSync(new URL('../../../backend/test/fixtures/masking.json', import.meta.url), 'utf8');
  assert.equal(readFileSync(fixturesUrl, 'utf8'), backend);
});

test('AC-61: MANDARINA_MASK_PII', () => {
  assert.deepEqual(piiFromEnv({}), [...PII_CATEGORIES]);
  assert.deepEqual(piiFromEnv({ MANDARINA_MASK_PII: '' }), [...PII_CATEGORIES]);
  assert.deepEqual(piiFromEnv({ MANDARINA_MASK_PII: 'none' }), []);
  assert.deepEqual(piiFromEnv({ MANDARINA_MASK_PII: ' Email , id ' }), ['email', 'id']);
  assert.deepEqual(piiFromEnv({ MANDARINA_MASK_PII: 'email,desconocida' }), ['email']);
});

test('AC-62: maskEvent enmascara el payload y el Bloqueo, y deja intactos los identificadores', () => {
  const event = {
    project: 'ana@example.com-repo',
    session_id: 's1',
    payload: { tool_input: { command: 'curl -H "x: sk-ant-api03-abcdefghijklmnop" ana@example.com' } },
    block: { rule: 'secret-in-command', reason: 'lleva sk-ant-api03-abcdefghijklmnop' },
  };
  const masked = maskEvent(event, {});
  assert.equal(masked.payload.tool_input.command, 'curl -H "x: [REDACTED_API_KEY]" [REDACTED_EMAIL]');
  assert.equal(masked.block.reason, 'lleva [REDACTED_API_KEY]');
  assert.equal(masked.project, 'ana@example.com-repo');
  assert.equal(event.payload.tool_input.command.includes('sk-ant'), true, 'no muta el Evento original');
});

test('AC-62: maskEvent respeta MANDARINA_MASK_PII', () => {
  const event = { payload: { prompt: 'ana@example.com API_KEY=abc' } };
  assert.equal(maskEvent(event, { MANDARINA_MASK_PII: 'none' }).payload.prompt, 'ana@example.com API_KEY=[REDACTED_PASSWORD]');
});
