import { normalizeAgentId } from '../domain/agent-id.js';
import type { StoredEvent } from '../domain/event.js';
import { normalizeEvaluation, type EvaluationObjectType, type Score } from '../domain/evaluation.js';
import { maskSecrets } from '../domain/mask-secrets.js';
import type { SessionEventRow } from '../domain/session-summary.js';
import { hintsOf, subagentLives, type SubagentLife } from '../domain/subagent-lifecycle.js';
import type { UsageEntry } from '../domain/token-usage.js';
import { metaLinksOf, readTranscript } from './list-sessions.js';
import type {
  Clock,
  EvaluationFilter,
  EvaluationRecord,
  EvaluationStore,
  EvaluationTagCount,
  EventRepository,
  TranscriptData,
  TranscriptReader,
} from './ports.js';

export const LIST_LIMIT = 500;
const SUMMARY_LENGTH = 200;

/** `Evaluation` de `spec/api-spec.yaml`. */
export interface Evaluation extends EvaluationRecord {
  summary: string | null;
  agent_type: string | null;
}

/** `EvaluationExportLine` de `spec/api-spec.yaml`. */
export interface EvaluationExportLine {
  object_type: EvaluationObjectType;
  object_id: string;
  project: string;
  session_id: string;
  model: string | null;
  prompt: string | null;
  response: string | null;
  tools: string[];
  score: Score | null;
  tags: string[];
  note: string | null;
  evaluated_at: string;
}

export interface EvaluationList {
  items: Evaluation[];
  tags: EvaluationTagCount[];
  facets: { projects: string[] };
}

export type PutResult = { ok: true; evaluation: Evaluation } | { ok: false; status: 400 | 404; message: string };

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);
const oneLine = (value: string | null): string | null => {
  const line = value?.trim().split('\n')[0]?.trim();
  if (!line) return null;
  return line.length > SUMMARY_LENGTH ? `${line.slice(0, SUMMARY_LENGTH - 1)}…` : line;
};
const withHints = (events: StoredEvent[]): Array<StoredEvent & SessionEventRow> =>
  events.map((e) => ({ ...e, ...hintsOf(e.event_type, e.tool_name, e.payload, e.subagent_id) }));
const isMain = (e: StoredEvent) => e.subagent_id === null;
const unique = (names: Array<string | null>) => [...new Set(names.filter((n): n is string => n !== null))];
const toolsOf = (events: StoredEvent[]) => unique(events.filter((e) => e.event_type === 'tool.pre').map((e) => e.tool_name));

function tagCounts(records: EvaluationRecord[]): EvaluationTagCount[] {
  const counts = new Map<string, number>();
  for (const record of records) for (const tag of record.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Modelo de la última respuesta que cae en la ventana `[from, to)`. */
function modelIn(entries: UsageEntry[], from: number, to: number): string | null {
  return (
    entries
      .filter((e) => Date.parse(e.timestamp) >= from && Date.parse(e.timestamp) < to)
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      .at(-1)?.model ?? null
  );
}

/** Lo que se sabe de una Sesión para resumir y exportar sus Evaluaciones; se calcula una vez por Sesión. */
interface SessionContext {
  events: StoredEvent[];
  lives: SubagentLife[];
  transcript: TranscriptData | undefined;
}

/** Casos de uso de las Evaluaciones humanas (AC-55, AC-56). */
export class ManageEvaluations {
  constructor(
    private readonly repository: EventRepository,
    private readonly transcripts: TranscriptReader,
    private readonly store: EvaluationStore,
    private readonly clock: Clock,
  ) {}

  put(objectType: EvaluationObjectType, objectId: string, body: unknown): PutResult {
    const parsed = normalizeEvaluation(body);
    if (!parsed.ok) return { ok: false, status: 400, message: parsed.message };
    const context = this.contextOf(objectType, objectId);
    if (!context) return { ok: false, status: 404, message: `No existe el objeto a evaluar: ${objectType} ${objectId}` };
    const record = this.store.put({ object_type: objectType, object_id: objectId, ...context, ...parsed.value }, this.clock.now().toISOString());
    return { ok: true, evaluation: this.describe([record], new Map())[0]! };
  }

  remove(objectType: EvaluationObjectType, objectId: string): boolean {
    return this.store.delete(objectType, objectId);
  }

  list(filter: EvaluationFilter): EvaluationList {
    const all = this.store.list(filter);
    return {
      items: this.describe(all.slice(0, LIST_LIMIT), new Map()),
      tags: tagCounts(all),
      facets: { projects: this.store.projects() },
    };
  }

  tags(): EvaluationTagCount[] {
    return this.store.tagCounts();
  }

  async exportLines(filter: EvaluationFilter): Promise<EvaluationExportLine[]> {
    const contexts = new Map<string, SessionContext>();
    const lines: EvaluationExportLine[] = [];
    for (const record of this.store.list(filter)) {
      const context = await this.sessionContext(record.session_id, contexts);
      lines.push({
        object_type: record.object_type,
        object_id: record.object_id,
        project: record.project,
        session_id: record.session_id,
        ...this.content(record, context),
        score: record.score,
        tags: record.tags,
        note: record.note,
        evaluated_at: record.updated_at,
      });
    }
    return maskSecrets(lines);
  }

  private contextOf(objectType: EvaluationObjectType, objectId: string): { session_id: string; project: string } | undefined {
    if (objectType === 'session') {
      const found = this.repository.sessionContext(objectId);
      return found ? { session_id: objectId, project: found.project } : undefined;
    }
    if (objectType === 'turn') {
      const event = this.repository.findById(objectId);
      return event?.event_type === 'prompt.submitted' && isMain(event) ? { session_id: event.session_id, project: event.project } : undefined;
    }
    return this.repository.subagentContext(objectId);
  }

  /** Añade el resumen (prompt o Tarea) a cada Evaluación; los Subagentes lo sacan de su Lanzamiento. */
  private describe(records: EvaluationRecord[], lives: Map<string, SubagentLife[]>): Evaluation[] {
    const livesOf = (sessionId: string) => {
      if (!lives.has(sessionId)) lives.set(sessionId, subagentLives(withHints(this.repository.sessionEvents(sessionId))));
      return lives.get(sessionId)!;
    };
    return records.map((record) => {
      if (record.object_type === 'turn') {
        return { ...record, summary: oneLine(text(this.repository.findById(record.object_id)?.payload.prompt)), agent_type: null };
      }
      if (record.object_type === 'subagent') {
        const life = livesOf(record.session_id).find((l) => l.subagent_id === record.object_id);
        return { ...record, summary: oneLine(life?.description ?? null), agent_type: life?.agent_type ?? null };
      }
      return { ...record, summary: null, agent_type: null };
    });
  }

  private async sessionContext(sessionId: string, cache: Map<string, SessionContext>): Promise<SessionContext> {
    const cached = cache.get(sessionId);
    if (cached) return cached;
    const events = this.repository.sessionEvents(sessionId);
    const pathEvent = [...events].reverse().find((e) => e.transcript_path !== null);
    const transcript = await readTranscript(this.transcripts, pathEvent?.transcript_path ?? null);
    const context = { events, transcript, lives: subagentLives(withHints(events), metaLinksOf(transcript)) };
    cache.set(sessionId, context);
    return context;
  }

  private content(record: EvaluationRecord, { events, lives, transcript }: SessionContext): Pick<EvaluationExportLine, 'model' | 'prompt' | 'response' | 'tools'> {
    const main = events.filter(isMain);
    if (record.object_type === 'session') {
      const ends = main.filter((e) => e.event_type === 'turn.ended');
      return {
        model: modelIn(transcript?.entries ?? [], 0, Infinity),
        prompt: unique(main.filter((e) => e.event_type === 'prompt.submitted').map((e) => text(e.payload.prompt))).join('\n\n') || null,
        response: text(ends.at(-1)?.payload.last_assistant_message),
        tools: toolsOf(main),
      };
    }
    if (record.object_type === 'turn') {
      const start = main.findIndex((e) => e.id === record.object_id);
      const next = main.findIndex((e, i) => i > start && e.event_type === 'prompt.submitted');
      const turn = main.slice(start, next === -1 ? undefined : next);
      const end = turn.find((e) => e.event_type === 'turn.ended');
      return {
        model: modelIn(transcript?.entries ?? [], Date.parse(main[start]!.occurred_at), next === -1 ? Infinity : Date.parse(main[next]!.occurred_at)),
        prompt: text(turn[0]?.payload.prompt),
        response: text(end?.payload.last_assistant_message),
        tools: toolsOf(turn),
      };
    }
    const own = events.filter((e) => e.subagent_id === record.object_id);
    const life = lives.find((l) => l.subagent_id === record.object_id);
    const launch = life?.launch_event_id ? events.find((e) => e.id === life.launch_event_id) : undefined;
    const stop = own.find((e) => e.event_type === 'subagent.stopped');
    const file = transcript?.subagents.find((s) => s.agentId === normalizeAgentId(record.object_id));
    return {
      model: modelIn(file?.entries ?? [], 0, Infinity),
      prompt: text((launch?.payload.tool_input as Record<string, unknown> | undefined)?.prompt),
      response: text(stop?.payload.last_assistant_message),
      tools: toolsOf(own),
    };
  }
}
