// Evaluación humana de una Sesión, un Turno o un Subagente (AC-54, roadmap §1.12).
import { maskSecrets } from './mask-secrets.js';

export const EVALUATION_OBJECT_TYPES = ['session', 'turn', 'subagent'] as const;
export type EvaluationObjectType = (typeof EVALUATION_OBJECT_TYPES)[number];

export type Score = 1 | -1;

/** Lo que la persona usuaria escribe; las tres partes son opcionales, pero alguna debe haber. */
export interface EvaluationContent {
  score: Score | null;
  tags: string[];
  note: string | null;
}

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 40;
export const MAX_NOTE_LENGTH = 2000;

/**
 * Minúsculas, sin acentos, con guiones en lugar de espacios y guiones bajos, y sin
 * más caracteres que letras, números y guiones: `Bug fix` y `bug-fix` son la misma.
 */
export function normalizeTag(raw: string): string | null {
  const tag = raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, MAX_TAG_LENGTH)
    .replace(/-+$/, '');
  return tag === '' ? null : tag;
}

export type NormalizedEvaluation = { ok: true; value: EvaluationContent } | { ok: false; message: string };

const invalid = (message: string): NormalizedEvaluation => ({ ok: false, message });

/** Valida y normaliza el cuerpo de un `PUT`; enmascara los secretos como cualquier Evento. */
export function normalizeEvaluation(input: unknown): NormalizedEvaluation {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid('La Evaluación debe ser un objeto');
  const { score, tags, note } = input as Record<string, unknown>;
  if (score !== 1 && score !== -1 && score !== null) return invalid('La Puntuación debe ser 1, -1 o null');
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) return invalid('Las Etiquetas deben ser una lista de textos');
  if (note !== null && typeof note !== 'string') return invalid('La Nota debe ser un texto o null');

  const normalized = [...new Set((tags as string[]).map((tag) => normalizeTag(maskSecrets(tag))).filter((tag): tag is string => tag !== null))];
  if (normalized.length > MAX_TAGS) return invalid(`Como máximo ${MAX_TAGS} Etiquetas`);
  const text = note === null ? '' : note.trim();
  if (text.length > MAX_NOTE_LENGTH) return invalid(`La Nota no puede pasar de ${MAX_NOTE_LENGTH} caracteres`);

  if (score === null && normalized.length === 0 && text === '') {
    return invalid('Una Evaluación vacía no se guarda: bórrala');
  }
  return { ok: true, value: { score, tags: normalized, note: text === '' ? null : maskSecrets(text) } };
}
