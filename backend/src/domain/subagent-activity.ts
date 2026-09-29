// Tarea y actividad de un Subagente leídas de su Transcript (`agent-<id>.jsonl`
// y `agent-<id>.meta.json`, ver `CONTEXT.md` y AC-23).
import { summarizeToolInput } from './tool-summary.js';

export type ToolCallStatus = 'ok' | 'error' | 'blocked' | 'running';

export interface ToolCall {
  name: string;
  summary: string | null;
  started_at: string;
  status: ToolCallStatus;
}

export interface SubagentActivity {
  /** Primer mensaje del Transcript: el prompt con el que se delegó la Tarea. */
  prompt: string | null;
  tools: ToolCall[];
  /** Último texto del Subagente: su respuesta, si ya terminó. */
  result: string | null;
}

export interface SubagentMeta {
  agentType: string | null;
  description: string | null;
  /** `tool_use_id` del `Agent` que lo lanzó: enlaza el lanzamiento con el Subagente (AC-33). */
  toolUseId: string | null;
  /** `requestShape: background`: lanzado en segundo plano (AC-45). */
  background: boolean;
}

type Block = { type?: unknown; text?: unknown; id?: unknown; name?: unknown; input?: unknown; tool_use_id?: unknown; is_error?: unknown };

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

function blocksOf(record: Record<string, unknown>): Block[] {
  const content = (record.message as { content?: unknown } | undefined)?.content;
  return Array.isArray(content) ? (content as Block[]) : [];
}

function promptOf(record: Record<string, unknown>): string | null {
  const content = (record.message as { content?: unknown } | undefined)?.content;
  if (typeof content === 'string') return text(content);
  return text(blocksOf(record).find((b) => b.type === 'text')?.text);
}

function parseLines(jsonl: string): Array<Record<string, unknown>> {
  const records: Array<Record<string, unknown>> = [];
  for (const line of jsonl.split('\n')) {
    if (line.trim() === '') continue;
    try {
      records.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      // El Transcript puede estar a medio escribir: la última línea se ignora.
    }
  }
  return records;
}

export function parseSubagentActivity(jsonl: string): SubagentActivity {
  const records = parseLines(jsonl);
  const firstUser = records.find((r) => r.type === 'user');
  const calls = new Map<string, ToolCall>();
  let result: string | null = null;

  for (const record of records) {
    const timestamp = typeof record.timestamp === 'string' ? record.timestamp : new Date(0).toISOString();
    for (const block of blocksOf(record)) {
      if (record.type === 'assistant' && block.type === 'tool_use' && typeof block.id === 'string') {
        const name = typeof block.name === 'string' ? block.name : 'desconocida';
        const input = block.input && typeof block.input === 'object' ? block.input : {};
        calls.set(block.id, {
          name,
          summary: summarizeToolInput(name, { tool_input: input }),
          started_at: timestamp,
          status: 'running',
        });
        result = null;
      } else if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
        const call = calls.get(block.tool_use_id);
        if (call) call.status = block.is_error === true ? 'error' : 'ok';
      } else if (record.type === 'assistant' && block.type === 'text') {
        // Un texto después de la última herramienta es la respuesta (o su borrador, si sigue en marcha).
        result = text(block.text) ?? result;
      }
    }
  }

  return { prompt: firstUser ? promptOf(firstUser) : null, tools: [...calls.values()], result };
}

/** Lo mínimo de un Evento para reconstruir las herramientas de un carril. */
export interface ToolEvent {
  event_type: string;
  tool_name: string | null;
  occurred_at: string;
  payload: Record<string, unknown>;
}

function failed(post: ToolEvent): boolean {
  // `PostToolUseFailure` no trae `tool_response`, sino `error` (ADR-0007).
  if (typeof post.payload.error === 'string' && post.payload.error !== '') return true;
  const response = post.payload.tool_response;
  if (!response || typeof response !== 'object') return false;
  const fields = response as Record<string, unknown>;
  return fields.is_error === true || (typeof fields.error === 'string' && fields.error !== '');
}

/**
 * Herramientas de un carril a partir de sus Eventos, en orden. Cada `tool.post`
 * cierra el `tool.pre` con su `tool_use_id`; sin id, el último abierto.
 */
export function toolCallsFromEvents(events: ToolEvent[]): ToolCall[] {
  const calls: ToolCall[] = [];
  const open = new Map<string, ToolCall>();
  let lastOpen: ToolCall | undefined;
  for (const event of events) {
    const id = typeof event.payload.tool_use_id === 'string' ? event.payload.tool_use_id : undefined;
    const name = event.tool_name ?? 'desconocida';
    if (event.event_type === 'tool.pre' || event.event_type === 'tool.blocked') {
      const call: ToolCall = {
        name,
        summary: summarizeToolInput(name, event.payload),
        started_at: event.occurred_at,
        status: event.event_type === 'tool.blocked' ? 'blocked' : 'running',
      };
      calls.push(call);
      if (call.status === 'running') {
        if (id) open.set(id, call);
        lastOpen = call;
      }
    } else if (event.event_type === 'tool.post') {
      const call = (id ? open.get(id) : undefined) ?? lastOpen;
      if (!call) continue;
      call.status = failed(event) ? 'error' : 'ok';
      if (id) open.delete(id);
      if (call === lastOpen) lastOpen = undefined;
    }
  }
  return calls;
}

export function parseSubagentMeta(json: string): SubagentMeta | null {
  try {
    const meta = JSON.parse(json) as Record<string, unknown>;
    return {
      agentType: text(meta.agentType),
      description: text(meta.description),
      toolUseId: text(meta.toolUseId),
      background: meta.requestShape === 'background',
    };
  } catch {
    return null;
  }
}
