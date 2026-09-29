// Evaluación humana de una Sesión, un Turno o un Subagente (AC-54, roadmap §1.12).

export type EvaluationObjectType = 'session' | 'turn' | 'subagent';
export const EVALUATION_OBJECT_TYPES: readonly EvaluationObjectType[] = ['session', 'turn', 'subagent'];

export type Score = 1 | -1;

/** Filtro de Puntuación del listado: +1, −1 o sin puntuar. */
export type ScoreFilter = 'up' | 'down' | 'none';

export interface Evaluation {
  objectType: EvaluationObjectType;
  objectId: string;
  sessionId: string;
  project: string;
  score: Score | null;
  tags: string[];
  note: string | null;
  /** El prompt del Turno o la Tarea del Subagente, en una línea; `null` en una Sesión. */
  summary: string | null;
  agentType: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Lo que la persona usuaria escribe. Las tres partes son opcionales, pero alguna debe haber. */
export interface EvaluationInput {
  score: Score | null;
  tags: string[];
  note: string | null;
}

export interface EvaluationTagCount {
  tag: string;
  count: number;
}

export interface EvaluationList {
  items: Evaluation[];
  tags: EvaluationTagCount[];
  projects: string[];
}

export interface EvaluationFilter {
  objectTypes?: EvaluationObjectType[];
  score?: ScoreFilter;
  tag?: string;
  project?: string;
  /** Solo Evaluaciones actualizadas desde este momento. */
  since?: Date;
  sessionId?: string;
}

/** Clave de un objeto evaluado, para buscar su Evaluación en un mapa. */
export const evaluationKey = (objectType: EvaluationObjectType, objectId: string) => `${objectType}:${objectId}`;

/** Una Evaluación sin Puntuación, Etiquetas ni Nota no se guarda: se borra. */
export const isEmptyInput = ({ score, tags, note }: EvaluationInput) => score === null && tags.length === 0 && (note ?? '').trim() === '';

export const toInput = (evaluation: Evaluation | null | undefined): EvaluationInput => ({
  score: evaluation?.score ?? null,
  tags: evaluation?.tags ?? [],
  note: evaluation?.note ?? null,
});

/** Etiquetas de sugerencia inicial (roadmap §1.12). */
export const SUGGESTED_TAGS: readonly string[] = ['bug-fix', 'hallucination', 'prompt-breakdown', 'refactor'];

const MAX_TAG_LENGTH = 40;

/**
 * Igual que el backend (AC-54): minúsculas, sin acentos, guiones en lugar de
 * espacios y guiones bajos, y solo letras, números y guiones.
 */
export function normalizeTag(raw: string): string | null {
  const tag = raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '');
  const trimmed = trimTrailingHyphens(tag.slice(0, MAX_TAG_LENGTH));
  return trimmed === '' ? null : trimmed;
}

/** Sin expresión regular: `-+$` retrocede de forma superlineal con muchos guiones. */
function trimTrailingHyphens(text: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === '-') end -= 1;
  return text.slice(0, end);
}
