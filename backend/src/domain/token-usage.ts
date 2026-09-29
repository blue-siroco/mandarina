// Uso de tokens leído del Transcript de Claude Code (ver `CONTEXT.md`, AC-12).

export interface TokenUsage {
  input: number;
  output: number;
  cache_read: number;
  /** La escritura de caché se tarifica distinto según el TTL, por eso se separa. */
  cache_creation_5m: number;
  cache_creation_1h: number;
}

/** Una respuesta del modelo tal como la registra el Transcript. */
export interface UsageEntry {
  messageId: string;
  model: string;
  timestamp: string;
  usage: TokenUsage;
}

export const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cache_read: 0, cache_creation_5m: 0, cache_creation_1h: 0 };

// Claude Code escribe respuestas internas (errores de API, avisos) con este modelo y sin coste.
const SYNTHETIC_MODEL = '<synthetic>';

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

function toUsage(raw: Record<string, unknown>): TokenUsage {
  const creation = count(raw.cache_creation_input_tokens);
  const split = raw.cache_creation as Record<string, unknown> | undefined;
  const oneHour = split ? Math.min(count(split.ephemeral_1h_input_tokens), creation) : 0;
  return {
    input: count(raw.input_tokens),
    output: count(raw.output_tokens),
    cache_read: count(raw.cache_read_input_tokens),
    cache_creation_5m: creation - oneHour,
    cache_creation_1h: oneHour,
  };
}

/**
 * Extrae las respuestas del modelo de un Transcript JSONL. Claude Code escribe
 * una línea por bloque de contenido y todas repiten el `usage` de la respuesta;
 * se conserva la última, que es la definitiva. Las líneas ilegibles se ignoran:
 * el Transcript puede estar a medio escribir.
 */
export function parseUsageEntries(jsonl: string): UsageEntry[] {
  const byId = new Map<string, UsageEntry>();
  for (const line of jsonl.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const message = record.message as Record<string, unknown> | undefined;
    const usage = message?.usage as Record<string, unknown> | undefined;
    if (record.type !== 'assistant' || !message || !usage) continue;
    if (typeof message.id !== 'string' || typeof message.model !== 'string' || message.model === SYNTHETIC_MODEL) continue;
    if (typeof record.timestamp !== 'string') continue;
    byId.set(message.id, { messageId: message.id, model: message.model, timestamp: record.timestamp, usage: toUsage(usage) });
  }
  return [...byId.values()];
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cache_read: a.cache_read + b.cache_read,
    cache_creation_5m: a.cache_creation_5m + b.cache_creation_5m,
    cache_creation_1h: a.cache_creation_1h + b.cache_creation_1h,
  };
}

/** Suma por modelo las respuestas desde `since`, sin contar dos veces la misma respuesta. */
export function usageByModel(entries: Iterable<UsageEntry>, since: Date): Map<string, TokenUsage> {
  const seen = new Set<string>();
  const totals = new Map<string, TokenUsage>();
  for (const entry of entries) {
    if (seen.has(entry.messageId) || Date.parse(entry.timestamp) < since.getTime()) continue;
    seen.add(entry.messageId);
    totals.set(entry.model, addUsage(totals.get(entry.model) ?? ZERO_USAGE, entry.usage));
  }
  return totals;
}
