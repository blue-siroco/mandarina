// Ciclo de vida de cada Subagente de una Sesión (AC-33): lanzamiento con la
// herramienta `Agent`/`Task`, inicio, actividad y fin, enlazados aunque falte
// algún hook. Se deriva al consultar, como las Ejecuciones de tests (ADR-0007).
import { normalizeAgentId } from './agent-id.js';
import type { EventType } from './event.js';
import type { SessionEventRow, SubagentHints } from './session-summary.js';

export const LAUNCH_TOOLS: ReadonlySet<string> = new Set(['Agent', 'Task']);
/** `tool_response.status` del `tool.post` de un Subagente en segundo plano: llega al lanzarlo, no al terminar. */
export const ASYNC_LAUNCHED = 'async_launched';

export interface SubagentLife {
  /** `subagent_id`, o `launch:<tool_use_id>` para un lanzamiento pendiente de enlazar. */
  key: string;
  subagent_id: string | null;
  tool_use_id: string | null;
  agent_type: string | null;
  description: string | null;
  launch_event_id: string | null;
  start_event_id: string | null;
  stop_event_id: string | null;
  started_at: string;
  stopped_at: string | null;
  internal: boolean;
  /** Herramientas invocadas por el propio Subagente. */
  tool_count: number;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const isLaunch = (row: SessionEventRow) => row.event_type === 'tool.pre' && row.tool_name !== null && LAUNCH_TOOLS.has(row.tool_name);
const isLaunchPost = (row: SessionEventRow) => row.event_type === 'tool.post' && row.tool_name !== null && LAUNCH_TOOLS.has(row.tool_name);

/** Las mismas pistas que extrae el repositorio en SQL, a partir de un payload completo. */
export function hintsOf(
  eventType: EventType,
  toolName: string | null,
  payload: Record<string, unknown>,
  subagentId: string | null = null,
): Required<SubagentHints> {
  const launchTool = toolName !== null && LAUNCH_TOOLS.has(toolName);
  const input = record(payload.tool_input);
  const response = record(payload.tool_response);
  return {
    agent_type: eventType.startsWith('subagent.') ? (typeof payload.agent_type === 'string' ? payload.agent_type : null) : null,
    tool_use_id: text(payload.tool_use_id),
    launch_type: launchTool && eventType === 'tool.pre' ? text(input.subagent_type) : null,
    launch_description: launchTool && eventType === 'tool.pre' ? text(input.description) : null,
    launched_agent_id: launchTool && eventType === 'tool.post' ? text(response.agentId) : null,
    response_status: launchTool && eventType === 'tool.post' ? text(response.status) : null,
    launch_background: launchTool && eventType === 'tool.pre' ? input.run_in_background === true : false,
    tool_error: eventType === 'tool.post' && text(payload.error) !== null && payload.is_interrupt !== true,
    skill_name: toolName === 'Skill' && eventType === 'tool.pre' ? text(input.skill) : null,
    session_agent_type: subagentId === null && !eventType.startsWith('subagent.') ? text(payload.agent_type) : null,
  };
}

interface Draft {
  id: string;
  own: SessionEventRow[];
  firstIndex: number;
  start?: SessionEventRow;
  stop?: SessionEventRow;
  type: string | null;
  launch?: SessionEventRow;
}

/**
 * Subagentes de una Sesión, por inicio. `rows` en orden de llegada, de una sola
 * Sesión. `metaLinks` son los `toolUseId → agentId` de los `.meta.json` del Transcript.
 */
export function subagentLives(rows: SessionEventRow[], metaLinks: ReadonlyMap<string, string> = new Map()): SubagentLife[] {
  const position = new Map(rows.map((row, index) => [row, index]));
  const launches = rows.filter(isLaunch);
  const launchByToolUse = new Map(launches.filter((l) => l.tool_use_id).map((l) => [l.tool_use_id!, l]));
  const posts = new Map(rows.filter((r) => isLaunchPost(r) && r.tool_use_id).map((r) => [r.tool_use_id!, r]));

  const drafts = new Map<string, Draft>();
  rows.forEach((row, index) => {
    if (row.subagent_id === null) return;
    const draft = drafts.get(row.subagent_id) ?? { id: row.subagent_id, own: [], firstIndex: index, type: null };
    draft.own.push(row);
    if (row.event_type === 'subagent.started') draft.start ??= row;
    if (row.event_type === 'subagent.stopped') draft.stop ??= row;
    drafts.set(row.subagent_id, draft);
  });
  for (const draft of drafts.values()) draft.type = text(draft.start?.agent_type) ?? text(draft.stop?.agent_type);

  // 1) Enlace exacto: el `.meta.json` del Transcript o el `agentId` del `tool.post`.
  const exact = new Map<string, string>(metaLinks);
  for (const [toolUseId, post] of posts) if (post.launched_agent_id) exact.set(toolUseId, normalizeAgentId(post.launched_agent_id));
  const linked = new Set<string>();
  for (const draft of drafts.values()) {
    const toolUseId = [...exact].find(([, agentId]) => agentId === normalizeAgentId(draft.id))?.[0];
    const launch = toolUseId ? launchByToolUse.get(toolUseId) : undefined;
    if (launch && !linked.has(launch.id)) {
      draft.launch = launch;
      linked.add(launch.id);
    }
  }
  // 2) Emparejamiento: el lanzamiento libre más antiguo del mismo Tipo, lanzado antes que el Subagente.
  const byFirstEvent = [...drafts.values()].sort((a, b) => a.firstIndex - b.firstIndex);
  for (const draft of byFirstEvent) {
    if (draft.launch || draft.type === null) continue;
    const first = draft.own[0]!;
    const launch = launches.find(
      (l) => !linked.has(l.id) && !exact.has(l.tool_use_id ?? '') && l.launch_type === draft.type && position.get(l)! < position.get(first)!,
    );
    if (launch) {
      draft.launch = launch;
      linked.add(launch.id);
    }
  }

  const endOf = (launch: SessionEventRow | undefined): string | null => {
    const post = launch?.tool_use_id ? posts.get(launch.tool_use_id) : undefined;
    return post && post.response_status !== ASYNC_LAUNCHED ? post.occurred_at : null;
  };

  const lives: Array<SubagentLife & { order: number }> = [...drafts.values()].map((draft) => {
    const { launch } = draft;
    const first = draft.own[0]!;
    return {
      key: draft.id,
      subagent_id: draft.id,
      tool_use_id: launch?.tool_use_id ?? null,
      agent_type: draft.type ?? launch?.launch_type ?? null,
      description: launch?.launch_description ?? null,
      launch_event_id: launch?.id ?? null,
      start_event_id: draft.start?.id ?? null,
      stop_event_id: draft.stop?.id ?? null,
      started_at: launch && launch.occurred_at < first.occurred_at ? launch.occurred_at : first.occurred_at,
      stopped_at: draft.stop?.occurred_at ?? endOf(launch),
      internal: !launch && draft.type === null && draft.own.every((r) => r.event_type === 'subagent.stopped'),
      tool_count: draft.own.filter((r) => r.event_type === 'tool.pre').length,
      order: draft.firstIndex,
    };
  });
  for (const launch of launches) {
    if (linked.has(launch.id)) continue;
    lives.push({
      key: `launch:${launch.tool_use_id ?? launch.id}`,
      subagent_id: null,
      tool_use_id: launch.tool_use_id ?? null,
      agent_type: launch.launch_type ?? null,
      description: launch.launch_description ?? null,
      launch_event_id: launch.id,
      start_event_id: null,
      stop_event_id: null,
      started_at: launch.occurred_at,
      stopped_at: endOf(launch),
      internal: false,
      tool_count: 0,
      order: position.get(launch)!,
    });
  }
  return lives
    .sort((a, b) => (a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : a.order - b.order))
    .map(({ order: _order, ...life }) => life);
}
