import { normalizeEvaluation, normalizeTag } from '../src/domain/evaluation.js';

describe('AC-54: Etiquetas', () => {
  it.each([
    ['bug-fix', 'bug-fix'],
    ['Bug fix', 'bug-fix'],
    ['  prompt_breakdown  ', 'prompt-breakdown'],
    ['Hallucination!', 'hallucination'],
    ['--refactor--', 'refactor'],
    ['a   b__c', 'a-b-c'],
    ['ÁRBOL de decisión', 'arbol-de-decision'],
    ['v2.0', 'v20'],
  ])('%j se guarda como %j', (raw, tag) => {
    expect(normalizeTag(raw)).toBe(tag);
  });

  it('descarta la que queda vacía al normalizar', () => {
    expect(normalizeTag('   ')).toBeNull();
    expect(normalizeTag('¡¿?!')).toBeNull();
  });

  it('recorta a 40 caracteres sin dejar un guion al final', () => {
    const tag = normalizeTag(`${'a'.repeat(39)} bcd`);
    expect(tag).toBe('a'.repeat(39));
    expect(normalizeTag('a'.repeat(60))).toHaveLength(40);
  });
});

describe('AC-54: Evaluación', () => {
  const ok = (input: unknown) => {
    const result = normalizeEvaluation(input);
    if (!result.ok) throw new Error(result.message);
    return result.value;
  };
  const fail = (input: unknown) => {
    const result = normalizeEvaluation(input);
    if (result.ok) throw new Error('debía ser inválida');
    return result.message;
  };

  it('acepta las tres partes y normaliza las Etiquetas sin repetirlas', () => {
    expect(ok({ score: 1, tags: ['Bug fix', 'bug-fix', 'REFACTOR', '!!'], note: 'Resolvió el AC-28.' })).toStrictEqual({
      score: 1,
      tags: ['bug-fix', 'refactor'],
      note: 'Resolvió el AC-28.',
    });
  });

  it('cada parte es opcional mientras haya alguna', () => {
    expect(ok({ score: -1, tags: [], note: null })).toStrictEqual({ score: -1, tags: [], note: null });
    expect(ok({ score: null, tags: ['x'], note: null }).tags).toStrictEqual(['x']);
    expect(ok({ score: null, tags: [], note: 'solo nota' }).note).toBe('solo nota');
  });

  it('una nota en blanco es null', () => {
    expect(ok({ score: 1, tags: [], note: '   \n ' }).note).toBeNull();
  });

  it('rechaza una Evaluación vacía', () => {
    expect(fail({ score: null, tags: [], note: null })).toMatch(/vacía/);
    expect(fail({ score: null, tags: ['!!'], note: '  ' })).toMatch(/vacía/);
  });

  it('rechaza una Puntuación que no es 1, -1 ni null', () => {
    for (const score of [0, 2, '1', true, 1.5]) expect(fail({ score, tags: [], note: 'x' })).toMatch(/Puntuación/);
  });

  it('rechaza más de 10 Etiquetas y una Nota de más de 2000 caracteres', () => {
    const tags = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(fail({ score: 1, tags, note: null })).toMatch(/10 Etiquetas/);
    expect(fail({ score: 1, tags: [], note: 'x'.repeat(2001) })).toMatch(/2000/);
    expect(ok({ score: 1, tags: [], note: 'x'.repeat(2000) }).note).toHaveLength(2000);
  });

  it('las Etiquetas repetidas cuentan una sola vez para el máximo', () => {
    const tags = [...Array.from({ length: 10 }, (_, i) => `t${i}`), 'T0'];
    expect(ok({ score: null, tags, note: null }).tags).toHaveLength(10);
  });

  it('rechaza un cuerpo que no es un objeto o con tipos incorrectos', () => {
    expect(fail(null)).toMatch(/objeto/);
    expect(fail({ score: 1, tags: 'x', note: null })).toMatch(/Etiquetas/);
    expect(fail({ score: 1, tags: [1], note: null })).toMatch(/Etiquetas/);
    expect(fail({ score: 1, tags: [], note: 3 })).toMatch(/Nota/);
  });

  it('enmascara los secretos de la Nota y de las Etiquetas', () => {
    const value = ok({ score: null, tags: ['sk-ant-abcdefghijklmnop'], note: 'usé API_KEY=abc123secreto' });
    expect(value.note).toBe('usé API_KEY=[REDACTED_PASSWORD]');
    expect(value.tags.join(' ')).not.toContain('abcdefghijklmnop');
  });
});
