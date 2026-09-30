import { open, stat } from 'node:fs/promises';
import { parseUsageLine, type UsageEntry } from '../domain/token-usage.js';

/** Bloque máximo por lectura: un Transcript enorme no reserva su tamaño entero en memoria de golpe. */
const CHUNK_BYTES = 1024 * 1024;
/** Ficheros con estado en memoria; al pasarlo se descarta el menos usado (los Transcripts cerrados no se leen más). */
const MAX_FILES = 500;

interface FileState {
  /** Inodo: un fichero sustituido por otro más grande no se lee desde el offset del anterior. */
  ino: number;
  /** Bytes del fichero ya consumidos (hasta el último salto de línea). */
  offset: number;
  size: number;
  mtimeMs: number;
  /** Cola sin terminar en `\n`: se completa con el siguiente append, no se pierde ni se cuenta dos veces. */
  pending: Buffer;
  /** Última respuesta de cada mensaje, como en `parseUsageEntries`. */
  byId: Map<string, UsageEntry>;
}

/**
 * Respuestas de un Transcript leídas por offset (ADR-0010): cada llamada solo lee
 * y parsea lo añadido desde la anterior. Un fichero que se trunca o se reescribe
 * (tamaño menor que el offset, o mismo tamaño con otro mtime) se relee entero.
 */
export class IncrementalUsage {
  private readonly files = new Map<string, FileState>();

  async read(path: string): Promise<UsageEntry[] | undefined> {
    try {
      const { size, mtimeMs, ino } = await stat(path);
      let state = this.files.get(path);
      if (state && (ino !== state.ino || size < state.offset + state.pending.length || (size === state.size && mtimeMs !== state.mtimeMs))) state = undefined;
      if (!state) {
        state = { ino, offset: 0, size: 0, mtimeMs: 0, pending: Buffer.alloc(0), byId: new Map() };
      }
      // Reinserta para que el orden del Map sea el de uso reciente y poder purgar por el principio.
      this.files.delete(path);
      this.files.set(path, state);
      if (this.files.size > MAX_FILES) this.files.delete(this.files.keys().next().value as string);
      if (size > state.size) await this.consume(path, state, size);
      state.size = size;
      state.mtimeMs = mtimeMs;
      return this.entriesOf(state);
    } catch {
      this.files.delete(path);
      return undefined;
    }
  }

  private async consume(path: string, state: FileState, size: number): Promise<void> {
    const handle = await open(path, 'r');
    try {
      let position = state.offset + state.pending.length;
      while (position < size) {
        const chunk = Buffer.alloc(Math.min(CHUNK_BYTES, size - position));
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
        if (bytesRead === 0) break;
        position += bytesRead;
        const data = Buffer.concat([state.pending, chunk.subarray(0, bytesRead)]);
        const cut = data.lastIndexOf(0x0a);
        if (cut >= 0) {
          for (const line of data.subarray(0, cut).toString('utf8').split('\n')) {
            const entry = parseUsageLine(line);
            if (entry) state.byId.set(entry.messageId, entry);
          }
          state.offset += cut + 1;
        }
        state.pending = data.subarray(cut + 1);
      }
    } finally {
      await handle.close();
    }
  }

  /** La última línea sin `\n` cuenta si ya es válida, igual que en una lectura completa. */
  private entriesOf(state: FileState): UsageEntry[] {
    const entries = new Map(state.byId);
    const tail = parseUsageLine(state.pending.toString('utf8'));
    if (tail) entries.set(tail.messageId, tail);
    return [...entries.values()];
  }
}
