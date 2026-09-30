import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import type { SubagentTranscript, TranscriptData, TranscriptReader } from '../application/ports.js';
import { normalizeAgentId } from '../domain/agent-id.js';
import {
  parseSubagentActivity,
  parseSubagentMeta,
  type SubagentActivity,
  type SubagentMeta,
} from '../domain/subagent-activity.js';
import { maskSecrets } from '../domain/mask-secrets.js';
import { parseSkillUses, type TranscriptSkillUse } from '../domain/skill-invocations.js';
import { parseUsageEntries, type UsageEntry } from '../domain/token-usage.js';
import { IncrementalUsage } from './incremental-usage.js';

/**
 * Traduce la ruta del host (`C:/Users/x/.claude/projects/...`, con cualquier
 * separador) a la del volumen montado (ADR-0003). Sin montaje, el backend corre
 * en el host y la ruta vale tal cual.
 */
export function toMountedPath(hostPath: string, mount: string | undefined): string {
  if (!mount) return hostPath;
  const normalized = hostPath.replaceAll('\\', '/');
  const marker = normalized.lastIndexOf('/.claude/');
  if (marker === -1) return hostPath;
  const mounted = join(mount, normalized.slice(marker + '/.claude/'.length));
  // Un `..` en la ruta que envía el hook no puede sacar la lectura del volumen montado.
  const inside = relative(mount, mounted);
  return inside.startsWith('..') || isAbsolute(inside) ? join(mount, '__fuera-del-montaje__') : mounted;
}

interface CachedFile<T> {
  mtimeMs: number;
  size: number;
  value: T;
}

interface MainFile {
  entries: UsageEntry[];
  skills: TranscriptSkillUse[];
}

interface SubagentFile extends MainFile {
  activity: SubagentActivity;
}

/**
 * Lee Transcripts del disco. Se piden en cada refresco del board y de las
 * fichas, así que cada fichero se vuelve a parsear solo si cambió su tamaño o su mtime.
 */
export class FsTranscriptReader implements TranscriptReader {
  private readonly cache = new Map<string, CachedFile<unknown>>();
  private readonly usage = new IncrementalUsage();

  constructor(private readonly mount: string | undefined) {}

  async read(transcriptPath: string): Promise<TranscriptData | undefined> {
    const main = toMountedPath(transcriptPath, this.mount);
    const own = await this.cached<MainFile>(main, (content) => ({
      entries: parseUsageEntries(content),
      skills: parseSkillUses(content),
    }));
    if (own === undefined) return undefined;
    // Claude Code guarda cada Subagente en `<sesión>/subagents/agent-*.jsonl` (+ `.meta.json`).
    const subagentsDir = join(dirname(main), basename(main, '.jsonl'), 'subagents');
    const files = await readdir(subagentsDir).catch(() => [] as string[]);
    const subagents: SubagentTranscript[] = [];
    for (const file of files.filter((f) => f.endsWith('.jsonl'))) {
      const name = basename(file, '.jsonl');
      const read = await this.cached<SubagentFile>(join(subagentsDir, file), (content) => ({
        entries: parseUsageEntries(content),
        // La Tarea, las herramientas y la respuesta salen de la conversación: se enmascaran como los Eventos (AC-62).
        activity: maskSecrets(parseSubagentActivity(content)),
        skills: parseSkillUses(content),
      }));
      if (!read) continue;
      const meta = await this.cached<SubagentMeta | null>(join(subagentsDir, `${name}.meta.json`), parseSubagentMeta);
      subagents.push({
        agentId: normalizeAgentId(name),
        entries: read.value.entries,
        activity: read.value.activity,
        skills: read.value.skills,
        meta: meta?.value ?? null,
      });
    }
    return { mtimeMs: own.mtimeMs, entries: own.value.entries, skills: own.value.skills, subagents };
  }

  /** Coste acumulado (ADR-0010): solo lee lo añadido a cada Transcript desde la última vez. */
  async readUsage(transcriptPath: string): Promise<UsageEntry[] | undefined> {
    const main = toMountedPath(transcriptPath, this.mount);
    const own = await this.usage.read(main);
    if (own === undefined) return undefined;
    const subagentsDir = join(dirname(main), basename(main, '.jsonl'), 'subagents');
    const files = await readdir(subagentsDir).catch(() => [] as string[]);
    const subagents = await Promise.all(files.filter((f) => f.endsWith('.jsonl')).map((f) => this.usage.read(join(subagentsDir, f))));
    return [...own, ...subagents.flatMap((entries) => entries ?? [])];
  }

  private async cached<T>(path: string, parse: (content: string) => T): Promise<CachedFile<T> | undefined> {
    try {
      const { mtimeMs, size } = await stat(path);
      const hit = this.cache.get(path) as CachedFile<T> | undefined;
      if (hit && hit.mtimeMs === mtimeMs && hit.size === size) return hit;
      const file = { mtimeMs, size, value: parse(await readFile(path, 'utf8')) };
      this.cache.set(path, file);
      return file;
    } catch {
      return undefined;
    }
  }
}
