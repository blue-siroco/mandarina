import { evaluationKey, isEmptyInput, normalizeTag, toInput } from './evaluation';
import { evaluation } from '../testing/evaluation-fixtures';

describe('AC-54: normalizeTag', () => {
  it.each([
    ['bug-fix', 'bug-fix'],
    ['Bug fix', 'bug-fix'],
    ['  prompt_breakdown  ', 'prompt-breakdown'],
    ['Hallucination!', 'hallucination'],
    ['--refactor--', 'refactor'],
    ['ÁRBOL de decisión', 'arbol-de-decision'],
  ])('%j → %j', (raw, tag) => {
    expect(normalizeTag(raw)).toBe(tag);
  });

  it('descarta la que queda vacía y recorta a 40 caracteres', () => {
    expect(normalizeTag('¡¿?!')).toBeNull();
    expect(normalizeTag('a'.repeat(60))).toHaveLength(40);
    expect(normalizeTag(`${'a'.repeat(39)} bcd`)).toBe('a'.repeat(39));
  });
});

describe('AC-57: Evaluación vacía', () => {
  it('sin Puntuación, Etiquetas ni Nota (o con la Nota en blanco) está vacía', () => {
    expect(isEmptyInput({ score: null, tags: [], note: null })).toBe(true);
    expect(isEmptyInput({ score: null, tags: [], note: '  \n' })).toBe(true);
    expect(isEmptyInput({ score: -1, tags: [], note: null })).toBe(false);
    expect(isEmptyInput({ score: null, tags: ['x'], note: null })).toBe(false);
    expect(isEmptyInput({ score: null, tags: [], note: 'algo' })).toBe(false);
  });

  it('toInput toma las tres partes de la Evaluación, o vacío si no hay', () => {
    expect(toInput(evaluation({ score: 1, tags: ['a'], note: 'n' }))).toStrictEqual({ score: 1, tags: ['a'], note: 'n' });
    expect(toInput(null)).toStrictEqual({ score: null, tags: [], note: null });
    expect(toInput(undefined)).toStrictEqual({ score: null, tags: [], note: null });
  });

  it('la clave junta tipo e id', () => {
    expect(evaluationKey('turn', 'p1')).toBe('turn:p1');
  });
});
