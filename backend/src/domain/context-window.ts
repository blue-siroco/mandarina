// Ventana de contexto estimada a partir del Transcript (design §5.10, AC-18).
import type { UsageEntry } from './token-usage.js';

const DEFAULT_LIMIT = 200_000;
const LARGE_LIMIT = 1_000_000;

// Modelos que Claude Code usa con ventana de 1M. Es una estimación: el
// Transcript no registra el límite con el que se lanzó la Sesión.
const LARGE_CONTEXT_PREFIXES = [
  'claude-fable-5',
  'claude-mythos-5',
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
];

export interface ContextWindow {
  model: string;
  used: number;
  limit: number;
}

/** El contexto ocupado es la entrada completa de la última respuesta del modelo. */
export function contextWindow(entries: UsageEntry[]): ContextWindow | null {
  const last = [...entries].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).at(-1);
  if (!last) return null;
  const { usage, model } = last;
  const used = usage.input + usage.cache_read + usage.cache_creation_5m + usage.cache_creation_1h;
  let limit = LARGE_CONTEXT_PREFIXES.some((p) => model.startsWith(p)) ? LARGE_LIMIT : DEFAULT_LIMIT;
  // Si la Sesión ya usó más de 200K, su ventana era la grande (p. ej. `[1m]`).
  if (used > limit) limit = LARGE_LIMIT;
  return { model, used, limit };
}

/** Modelo más reciente del Transcript. */
export function latestModel(entries: UsageEntry[]): string | null {
  return [...entries].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).at(-1)?.model ?? null;
}
