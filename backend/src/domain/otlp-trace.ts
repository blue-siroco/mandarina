// Traza OTLP/JSON de un Turno con la convención OpenInference (AC-49, AC-50;
// ADR-0008). Pura: la construye a posteriori a partir de los Eventos guardados
// y del Uso de tokens del Transcript, con ids deterministas.
import { createHash } from 'node:crypto';
import type { StoredEvent } from './event.js';
import { estimateCost } from './pricing.js';
import type { SessionEventRow } from './session-summary.js';
import { hintsOf, subagentLives, type SubagentLife } from './subagent-lifecycle.js';
import type { UsageEntry } from './token-usage.js';

export interface OtlpValue {
  stringValue?: string;
  intValue?: number;
  doubleValue?: number;
  boolValue?: boolean;
}

export interface OtlpAttribute {
  key: string;
  value: OtlpValue;
}

export interface OtlpSpanEvent {
  timeUnixNano: string;
  name: string;
  attributes: OtlpAttribute[];
}

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
  events?: OtlpSpanEvent[];
  status?: { code: number; message?: string };
}

export interface OtlpTraceRequest {
  resourceSpans: Array<{
    resource: { attributes: OtlpAttribute[] };
    scopeSpans: Array<{ scope: { name: string; version: string }; spans: OtlpSpan[] }>;
  }>;
}

export interface TurnTraceInput {
  session: { session_id: string; project: string; directory: string; harness: string };
  /** `id` es el del `prompt.submitted` que abre el Turno; `ended_at`, su fin o el último Evento. */
  turn: { id: string; index: number; started_at: string; ended_at: string };
  /** Eventos del Turno, de su prompt a su fin, con los de sus Subagentes, en orden de llegada. */
  events: StoredEvent[];
  /** Respuestas del agente principal; se toman las que caen dentro del Turno. */
  main: UsageEntry[];
  subagents: Array<{ agentId: string; entries: UsageEntry[] }>;
  includeContent: boolean;
  /** `toolUseId → agentId` de los `.meta.json` del Transcript (AC-33). */
  metaLinks?: ReadonlyMap<string, string>;
}

const SPAN_KIND_INTERNAL = 1;
const STATUS_ERROR = 2;
const SCOPE = { name: 'mandarina', version: '0.1.0' };
const JSON_MIME = 'application/json';
// El Transcript puede escribir la última respuesta justo después del hook `Stop`.
const END_SLACK_MS = 2000;

const ms = (iso: string) => Date.parse(iso);
const nanos = (iso: string) => String(BigInt(ms(iso)) * 1_000_000n);
const hex = (text: string, length: number) => createHash('sha256').update(text).digest('hex').slice(0, length);
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

function attribute(key: string, value: string | number | boolean): OtlpAttribute {
  if (typeof value === 'string') return { key, value: { stringValue: value } };
  if (typeof value === 'boolean') return { key, value: { boolValue: value } };
  return Number.isInteger(value) ? { key, value: { intValue: value } } : { key, value: { doubleValue: value } };
}

const asJson = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

function contentAttributes(inputValue: unknown, outputValue: unknown, json: boolean): OtlpAttribute[] {
  const result: OtlpAttribute[] = [];
  if (inputValue !== undefined && inputValue !== null) {
    result.push(attribute('input.value', json ? asJson(inputValue) : String(inputValue)));
    if (json) result.push(attribute('input.mime_type', JSON_MIME));
  }
  if (outputValue !== undefined && outputValue !== null) {
    result.push(attribute('output.value', json ? asJson(outputValue) : String(outputValue)));
    if (json) result.push(attribute('output.mime_type', JSON_MIME));
  }
  return result;
}

function toRow(event: StoredEvent): SessionEventRow {
  return { ...event, ...hintsOf(event.event_type, event.tool_name, event.payload, event.subagent_id) };
}

/** Carril de un Evento: el agente principal o su Subagente. */
const MAIN = 'main';
const laneOf = (event: StoredEvent) => event.subagent_id ?? MAIN;

export function buildTurnTrace(input: TurnTraceInput): OtlpTraceRequest {
  const { session, turn, events, includeContent } = input;
  const traceId = hex(`${session.session_id}:${turn.id}`, 32);
  const spanId = (key: string) => hex(`${traceId}:${key}`, 16);
  const rootId = spanId('turn');
  const turnEnd = turn.ended_at;
  const spans: OtlpSpan[] = [];
  const span = (fields: Omit<OtlpSpan, 'traceId' | 'kind'>): OtlpSpan => ({ traceId, kind: SPAN_KIND_INTERNAL, ...fields });

  // Subagentes del Turno, sin los internos, y el span del que cuelga cada uno.
  const lives = subagentLives(events.map(toRow), input.metaLinks).filter((l) => !l.internal && l.subagent_id !== null);
  const agentSpanOf = new Map<string, string>();
  for (const life of lives) agentSpanOf.set(life.subagent_id!, spanId(`agent:${life.subagent_id}`));
  const parentOf = (lane: string) => (lane === MAIN ? rootId : (agentSpanOf.get(lane) ?? rootId));

  // Marcas de cada carril: el inicio de una respuesta del modelo es la marca anterior.
  const marks = new Map<string, number[]>([[MAIN, [ms(turn.started_at)]]]);
  const mark = (lane: string, iso: string) => marks.set(lane, [...(marks.get(lane) ?? []), ms(iso)]);
  for (const life of lives) mark(life.subagent_id!, life.started_at);

  let cost = 0;
  let hasCost = false;

  // Herramientas: cada `tool.pre` con su `tool.post` por `tool_use_id`, y los Bloqueos.
  const posts = new Map<string, StoredEvent>();
  for (const e of events) {
    const id = text(e.payload.tool_use_id);
    if (e.event_type === 'tool.post' && id !== null) posts.set(id, e);
  }
  for (const e of events) {
    if (e.event_type === 'tool.pre') {
      const post = posts.get(text(e.payload.tool_use_id) ?? '');
      const error = post ? text(post.payload.error) : null;
      if (post) mark(laneOf(e), post.occurred_at);
      spans.push(
        span({
          spanId: spanId(e.id),
          parentSpanId: parentOf(laneOf(e)),
          name: e.tool_name ?? 'tool',
          startTimeUnixNano: nanos(e.occurred_at),
          endTimeUnixNano: nanos(post?.occurred_at ?? turnEnd),
          attributes: [
            attribute('openinference.span.kind', 'TOOL'),
            attribute('tool.name', e.tool_name ?? 'tool'),
            ...(post ? [] : [attribute('mandarina.tool.status', 'no_response')]),
            ...(includeContent ? contentAttributes(e.payload.tool_input, post?.payload.tool_response, true) : []),
          ],
          ...(error ? { status: { code: STATUS_ERROR, message: error.split('\n')[0]!.trim() } } : {}),
        }),
      );
    } else if (e.event_type === 'tool.blocked') {
      mark(laneOf(e), e.occurred_at);
      spans.push(
        span({
          spanId: spanId(e.id),
          parentSpanId: parentOf(laneOf(e)),
          name: e.tool_name ?? 'tool',
          startTimeUnixNano: nanos(e.occurred_at),
          endTimeUnixNano: nanos(e.occurred_at),
          attributes: [
            attribute('openinference.span.kind', 'TOOL'),
            attribute('tool.name', e.tool_name ?? 'tool'),
            ...(includeContent ? contentAttributes(e.payload.tool_input, undefined, true) : []),
          ],
          events: [
            {
              timeUnixNano: nanos(e.occurred_at),
              name: 'mandarina.block',
              attributes: [
                attribute('mandarina.block.rule', e.block?.rule ?? ''),
                attribute('mandarina.block.reason', e.block?.reason ?? ''),
              ],
            },
          ],
          status: { code: STATUS_ERROR, message: e.block?.reason ?? 'Bloqueo' },
        }),
      );
    }
  }

  // Subagentes, colgando del span de su Lanzamiento.
  const eventById = new Map(events.map((e) => [e.id, e]));
  for (const life of lives) spans.push(agentSpan(life));
  function agentSpan(life: SubagentLife): OtlpSpan {
    const launch = life.launch_event_id ? eventById.get(life.launch_event_id) : undefined;
    const stop = life.stop_event_id ? eventById.get(life.stop_event_id) : undefined;
    const task = launch ? record(launch.payload.tool_input).prompt : undefined;
    return span({
      spanId: agentSpanOf.get(life.subagent_id!)!,
      parentSpanId: launch ? spanId(launch.id) : rootId,
      name: `agent ${life.agent_type ?? 'unknown'}`,
      startTimeUnixNano: nanos(life.started_at),
      endTimeUnixNano: nanos(life.stopped_at ?? turnEnd),
      attributes: [
        attribute('openinference.span.kind', 'AGENT'),
        attribute('session.id', session.session_id),
        ...(life.agent_type ? [attribute('mandarina.subagent.type', life.agent_type)] : []),
        ...(includeContent ? contentAttributes(task, stop ? text(stop.payload.last_assistant_message) : undefined, false) : []),
      ],
    });
  }

  // Respuestas del modelo: las del agente principal dentro del Turno y las de cada Subagente dentro de su vida.
  const windows: Array<{ lane: string; entries: UsageEntry[]; from: string; to: string }> = [
    { lane: MAIN, entries: input.main, from: turn.started_at, to: turnEnd },
  ];
  for (const life of lives) {
    const own = input.subagents.find((s) => s.agentId === life.subagent_id);
    if (own) windows.push({ lane: life.subagent_id!, entries: own.entries, from: life.started_at, to: life.stopped_at ?? turnEnd });
  }
  const seen = new Set<string>();
  for (const { lane, entries, from, to } of windows) {
    const inside = entries
      .filter((e) => ms(e.timestamp) >= ms(from) && ms(e.timestamp) <= ms(to) + END_SLACK_MS)
      .sort((a, b) => ms(a.timestamp) - ms(b.timestamp));
    for (const entry of inside) {
      if (seen.has(entry.messageId)) continue;
      seen.add(entry.messageId);
      const end = ms(entry.timestamp);
      const start = Math.max(...(marks.get(lane) ?? []).filter((m) => m <= end), ms(from));
      mark(lane, entry.timestamp);
      const u = entry.usage;
      const prompt = u.input + u.cache_read + u.cache_creation_5m + u.cache_creation_1h;
      const usd = estimateCost(entry.model, u);
      if (usd !== undefined) {
        cost += usd;
        hasCost = true;
      }
      spans.push(
        span({
          spanId: spanId(`llm:${entry.messageId}`),
          parentSpanId: parentOf(lane),
          name: 'llm',
          startTimeUnixNano: nanos(new Date(start).toISOString()),
          endTimeUnixNano: nanos(entry.timestamp),
          attributes: [
            attribute('openinference.span.kind', 'LLM'),
            attribute('llm.model_name', entry.model),
            attribute('llm.token_count.prompt', prompt),
            attribute('llm.token_count.completion', u.output),
            attribute('llm.token_count.total', prompt + u.output),
            attribute('llm.token_count.prompt_details.cache_read', u.cache_read),
            attribute('llm.token_count.prompt_details.cache_write', u.cache_creation_5m + u.cache_creation_1h),
            attribute('gen_ai.usage.input_tokens', prompt),
            attribute('gen_ai.usage.output_tokens', u.output),
            ...(usd === undefined ? [] : [attribute('mandarina.cost.usd', usd)]),
          ],
        }),
      );
    }
  }

  const promptEvent = events.find((e) => e.id === turn.id);
  const endEvent = [...events].reverse().find((e) => e.event_type === 'turn.ended' && e.subagent_id === null);
  const root = span({
    spanId: rootId,
    name: 'turn',
    startTimeUnixNano: nanos(turn.started_at),
    endTimeUnixNano: nanos(turnEnd),
    attributes: [
      attribute('openinference.span.kind', 'AGENT'),
      attribute('session.id', session.session_id),
      attribute('mandarina.turn.index', turn.index),
      ...(hasCost ? [attribute('mandarina.cost.usd', cost)] : []),
      ...(includeContent
        ? contentAttributes(text(promptEvent?.payload.prompt), endEvent ? text(endEvent.payload.last_assistant_message) : undefined, false)
        : []),
    ],
  });

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            attribute('service.name', 'mandarina'),
            attribute('mandarina.project', session.project),
            attribute('mandarina.directory', session.directory),
            attribute('mandarina.harness', session.harness),
          ],
        },
        scopeSpans: [{ scope: SCOPE, spans: [root, ...spans] }],
      },
    ],
  };
}
