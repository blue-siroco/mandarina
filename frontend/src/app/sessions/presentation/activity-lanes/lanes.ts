// Carriles de actividad (spec/design.md §5.9): un carril para el agente
// principal, uno por Subagente y uno de Bloqueos si los hay. Las posiciones
// son porcentajes del intervalo visible, para pintarlas con CSS sin escalar marcas.
import { EventType, ObservedEvent } from '../../../events/models/observed-event';
import { EVENT_TYPE_LABELS, summarizeEvent } from '../../../events/presentation/event-labels';
import { shortId } from '../../../shared/format';
import { SessionSubagent, SessionTurn } from '../../models/session';

export type MarkShape = 'dot' | 'diamond' | 'cross';

export interface Mark {
  id: string;
  at: number;
  type: EventType;
  shape: MarkShape;
  title: string;
}

export interface Span {
  from: number;
  to: number;
  title: string;
}

export interface Lane {
  key: string;
  label: string;
  kind: 'main' | 'subagent' | 'blocks';
  marks: Mark[];
  /** `tool.pre` → `tool.post` como barra con la duración. */
  bars: Span[];
}

export interface LanesView {
  lanes: Lane[];
  /** Franjas de los Turnos en el carril principal: hacen visible la Duración activa. */
  turns: Span[];
  ticks: Array<{ at: number; label: string }>;
}

const TICKS = 5;

const time = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const shortTime = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

function shapeOf(type: EventType): MarkShape {
  if (type === 'prompt.submitted') return 'diamond';
  if (type === 'tool.blocked') return 'cross';
  return 'dot';
}

export function buildLanes(
  events: ObservedEvent[],
  turns: SessionTurn[],
  subagents: SessionSubagent[],
  end: Date,
): LanesView {
  const ordered = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const first = ordered[0];
  if (!first) return { lanes: [], turns: [], ticks: [] };
  const start = first.occurredAt.getTime();
  const span = Math.max(1, Math.max(end.getTime(), ordered.at(-1)!.occurredAt.getTime()) - start);
  const pos = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - start) / span) * 100));

  const types = new Map(subagents.map((s) => [s.subagentId, s.agentType]));
  const lanes = new Map<string, Lane>([['main', { key: 'main', label: 'Principal', kind: 'main', marks: [], bars: [] }]]);
  const laneFor = (event: ObservedEvent): Lane => {
    const key = event.eventType === 'tool.blocked' ? 'blocks' : (event.subagentId ?? 'main');
    let lane = lanes.get(key);
    if (!lane) {
      const kind = key === 'blocks' ? 'blocks' : 'subagent';
      const label = kind === 'blocks' ? 'Bloqueos' : `└ ${types.get(key) ?? shortId(key)}`;
      lane = { key, label, kind, marks: [], bars: [] };
      lanes.set(key, lane);
    }
    return lane;
  };

  const openTool = new Map<string, ObservedEvent>();
  for (const event of ordered) {
    const lane = laneFor(event);
    const summary = summarizeEvent(event);
    const title = [time(event.occurredAt), EVENT_TYPE_LABELS[event.eventType], summary].filter(Boolean).join(' · ');
    if (event.eventType === 'tool.pre') openTool.set(lane.key, event);
    if (event.eventType === 'tool.post') {
      const pre = openTool.get(lane.key);
      openTool.delete(lane.key);
      if (pre) {
        lane.bars.push({ from: pos(pre.occurredAt), to: pos(event.occurredAt), title });
        continue;
      }
    }
    lane.marks.push({ id: event.id, at: pos(event.occurredAt), type: event.eventType, shape: shapeOf(event.eventType), title });
  }

  // Bloqueos al final, como en §5.9.
  const sorted = [...lanes.values()].sort((a, b) => rank(a) - rank(b));
  const ticks = Array.from({ length: TICKS }, (_, i) => {
    const at = (i / (TICKS - 1)) * 100;
    return { at, label: shortTime(new Date(start + (span * at) / 100)) };
  });
  const turnSpans = turns.map((t) => ({
    from: pos(t.startedAt),
    to: pos(t.endedAt ?? end),
    title: `Turno ${t.index}`,
  }));
  return { lanes: sorted, turns: turnSpans, ticks };
}

function rank(lane: Lane): number {
  if (lane.kind === 'main') return 0;
  return lane.kind === 'blocks' ? 2 : 1;
}
