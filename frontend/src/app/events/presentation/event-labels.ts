import { formatDuration } from '../../shared/format';
import { isMcpTool, oneLine, summarizeToolInput, toolLabel } from '../../shared/tool-summary';
import { EventType, ObservedEvent } from '../models/observed-event';

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  'session.started': 'Sesión iniciada',
  'prompt.submitted': 'Prompt',
  'tool.pre': 'Herramienta (antes)',
  'tool.post': 'Herramienta (después)',
  'subagent.started': 'Subagente iniciado',
  'subagent.stopped': 'Subagente terminado',
  'turn.ended': 'Fin de turno',
  'session.ended': 'Sesión cerrada',
  'tool.blocked': 'Bloqueado',
};

/** Categorías del filtro de Eventos (spec/design.md §5.5), en su orden. */
const TOOL_EVENTS = ['tool.pre', 'tool.post'] as const;
const BLOCK_EVENTS = ['tool.blocked'] as const;

export const EVENT_CATEGORIES = [
  { key: 'all', label: 'Todos', types: [] },
  { key: 'prompts', label: 'Prompts', types: ['prompt.submitted'] },
  { key: 'tools', label: 'Herramientas', types: TOOL_EVENTS },
  { key: 'subagents', label: 'Subagentes', types: ['subagent.started', 'subagent.stopped'] },
  { key: 'session', label: 'Sesión', types: ['session.started', 'session.ended'] },
  { key: 'turns', label: 'Turnos', types: ['turn.ended'] },
  { key: 'blocks', label: 'Bloqueos', types: BLOCK_EVENTS },
  { key: 'mcp', label: 'MCP', types: [...TOOL_EVENTS, ...BLOCK_EVENTS] },
  // Sin tipos: cuenta cualquier Evento que traiga un Aviso de inyección vigente (AC-68).
  { key: 'warnings', label: 'Avisos', types: [] },
] as const satisfies ReadonlyArray<{ key: string; label: string; types: readonly EventType[] }>;

export type EventCategory = (typeof EVENT_CATEGORIES)[number]['key'];

export function inCategory(event: ObservedEvent, category: EventCategory): boolean {
  const types: readonly EventType[] = EVENT_CATEGORIES.find((c) => c.key === category)?.types ?? [];
  if (category === 'mcp' && !isMcpTool(event.toolName)) return false;
  if (category === 'warnings') return hasActiveWarnings(event);
  return types.length === 0 || types.includes(event.eventType);
}

/** Avisos de inyección sin descartar (AC-68). */
export const activeWarnings = (event: ObservedEvent) => event.warnings.filter((w) => !w.dismissed);
export const hasActiveWarnings = (event: ObservedEvent) => event.warnings.some((w) => !w.dismissed);

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

function summarizeTool(event: ObservedEvent): string | null {
  const input = summarizeToolInput(event.toolName, event.payload);
  if (!event.toolName) return input;
  const name = toolLabel(event.toolName);
  return input ? `${name} · ${input}` : name;
}

/** `e2e-builder · generar tests del AC-28 · 3 min` (AC-36); sin datos del servidor, el tipo del payload. */
function summarizeSubagent(event: ObservedEvent): string | null {
  const sub = event.subagent;
  const type = sub?.type ?? text(event.payload['agent_type']);
  const duration = sub?.durationMs == null ? null : formatDuration(sub.durationMs);
  const parts = [type, sub?.description ? oneLine(sub.description) : null, duration].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Resumen de una línea de la fila de Evento (§5.8): entrada de la herramienta, prompt o tipo de Subagente. */
export function summarizeEvent(event: ObservedEvent): string | null {
  const { payload } = event;
  switch (event.eventType) {
    case 'tool.pre':
    case 'tool.post':
    case 'tool.blocked':
      return summarizeTool(event);
    case 'prompt.submitted': {
      const prompt = text(payload['prompt']);
      return prompt ? oneLine(prompt) : null;
    }
    case 'subagent.started':
    case 'subagent.stopped':
      return summarizeSubagent(event);
    case 'session.started':
      return text(payload['source']);
    default:
      return null;
  }
}

export const MASK = '***';
// Desde ADR-0009 el servidor deja un marcador con el tipo (`[REDACTED_API_KEY]`); antes dejaba `***`.
const MASKED = /\*\*\*|\[REDACTED_[A-Z_]+\]/g;

export interface Segment {
  text: string;
  secret: boolean;
}

/** Trocea un texto en partes normales y valores enmascarados por el servidor (§5.13). */
export function maskedSegments(value: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of value.matchAll(MASKED)) {
    if (match.index > last) segments.push({ text: value.slice(last, match.index), secret: false });
    segments.push({ text: match[0] === MASK ? '‹secreto›' : match[0], secret: true });
    last = match.index + match[0].length;
  }
  if (last < value.length) segments.push({ text: value.slice(last), secret: false });
  return segments;
}
