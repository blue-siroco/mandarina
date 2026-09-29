// Invocaciones de skill derivadas de los Eventos al consultar (AC-29), con el
// mismo patrón que las Ejecuciones de tests (ADR-0007): sin Tipo de evento
// nuevo ni cambios en el Adaptador.
import { normalizeAgentId } from './agent-id.js';
import { summarizeSession, type SessionEventRow } from './session-summary.js';
import { subagentLives } from './subagent-lifecycle.js';

export type SkillInvoker = 'agent' | 'subagent' | 'user';
export type SkillInvocationStatus = 'running' | 'finished' | 'failed';

export interface SkillInvocation {
  id: string;
  /** `null` si solo consta en el Transcript. */
  event_id: string | null;
  project: string;
  directory: string;
  session_id: string;
  subagent_id: string | null;
  subagent_type: string | null;
  turn: number | null;
  skill: string;
  args: string | null;
  invoker: SkillInvoker;
  status: SkillInvocationStatus;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  error: string | null;
}

export interface SkillUsage {
  project: string;
  skill: string;
  total: number;
  by_invoker: Record<SkillInvoker, number>;
  last_at: string;
}

/** Fila de la Sesión; solo los Eventos que hay que leer traen `payload`. */
export type SkillEventRow = SessionEventRow & { payload?: Record<string, unknown> };

export const SKILL_TOOL = 'Skill';
const MAX_ARGS_LENGTH = 120;
// Claude Code solo interpreta el comando al principio del prompt; una segunda
// `/` en el nombre es una ruta (`/spec/roadmap`), no una skill.
const SLASH_COMMAND = /^\/([\w:-]+)(?=\s|$)(.*)/;

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

function firstLine(value: unknown): string | null {
  const line = text(value)?.split('\n')[0]!.trim();
  if (!line) return null;
  return line.length > MAX_ARGS_LENGTH ? `${line.slice(0, MAX_ARGS_LENGTH - 1)}…` : line;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/** `/nombre args` al principio del prompt; `null` si no es una invocación. */
export function parseSlashCommand(prompt: unknown): { skill: string; args: string | null } | null {
  if (typeof prompt !== 'string') return null;
  const match = SLASH_COMMAND.exec(prompt.trimStart());
  if (!match) return null;
  return { skill: match[1]!, args: firstLine(match[2]) };
}

interface Loaded {
  row: SkillEventRow;
  skill: string;
  args: string | null;
  invoker: SkillInvoker;
  turn: number | null;
  toolUseId: string | null;
}

function load(row: SkillEventRow, turn: number | null): Loaded | undefined {
  if (row.event_type === 'prompt.submitted' && row.subagent_id === null) {
    const command = parseSlashCommand(row.payload?.prompt);
    return command ? { row, ...command, invoker: 'user', turn, toolUseId: null } : undefined;
  }
  if (row.event_type !== 'tool.pre' || row.tool_name !== SKILL_TOOL) return undefined;
  const input = record(row.payload?.tool_input);
  const skill = text(input?.skill);
  if (!skill) return undefined;
  return {
    row,
    skill,
    args: firstLine(input?.args),
    invoker: row.subagent_id === null ? 'agent' : 'subagent',
    turn,
    toolUseId: text(row.payload?.tool_use_id),
  };
}

/** Error de carga del `tool.post`, o `undefined` si la Skill se cargó bien. */
function loadError(post: SkillEventRow | undefined): { error: string | null } | undefined {
  if (!post) return undefined;
  const error = firstLine(post.payload?.error);
  if (error) return { error };
  return record(post.payload?.tool_response)?.success === false ? { error: null } : undefined;
}

/** Invocaciones de skill de una Sesión; `rows` en orden de llegada. La más reciente primero. */
export function skillInvocationsOfSession(rows: SkillEventRow[], now: Date): SkillInvocation[] {
  const core = summarizeSession(rows, now);
  const unfinishable = core.state === 'closed' || core.state === 'orphaned';
  const loaded: Loaded[] = [];
  const posts = new Map<string, SkillEventRow>();
  const subagentStops = new Map<string, string>();
  const subagentTypes = new Map<string, string>();
  let turn = 0;

  for (const row of rows) {
    if (row.event_type === 'prompt.submitted' && row.subagent_id === null) turn += 1;
    const invocation = load(row, turn === 0 ? null : turn);
    if (invocation) loaded.push(invocation);
    const toolUseId = text(row.payload?.tool_use_id);
    if (row.event_type === 'tool.post' && row.tool_name === SKILL_TOOL && toolUseId) posts.set(toolUseId, row);
    if (row.subagent_id !== null && (row.event_type === 'subagent.started' || row.event_type === 'subagent.stopped')) {
      const type = text(row.payload?.agent_type);
      if (type && !subagentTypes.has(row.subagent_id)) subagentTypes.set(row.subagent_id, type);
      if (row.event_type === 'subagent.stopped' && !subagentStops.has(row.subagent_id)) {
        subagentStops.set(row.subagent_id, row.occurred_at);
      }
    }
  }

  return loaded
    .map((invocation): SkillInvocation => {
      const { row } = invocation;
      const failure = loadError(invocation.toolUseId ? posts.get(invocation.toolUseId) : undefined);
      // Una Skill solo carga instrucciones: dura lo que dure el trabajo que
      // guía, hasta el fin de su Turno o de su Subagente.
      const endedAt = failure
        ? null
        : row.subagent_id !== null
          ? (subagentStops.get(row.subagent_id) ?? null)
          : invocation.turn === null
            ? null
            : (core.turns[invocation.turn - 1]?.ended_at ?? null);
      const status: SkillInvocationStatus = failure ? 'failed' : endedAt !== null || unfinishable ? 'finished' : 'running';
      return {
        id: row.id,
        event_id: row.id,
        project: row.project,
        directory: row.directory,
        session_id: row.session_id,
        subagent_id: row.subagent_id,
        subagent_type: row.subagent_id === null ? null : (subagentTypes.get(row.subagent_id) ?? null),
        turn: invocation.turn,
        skill: invocation.skill,
        args: invocation.args,
        invoker: invocation.invoker,
        status,
        started_at: row.occurred_at,
        ended_at: endedAt,
        duration_ms: endedAt === null ? null : Math.max(0, Date.parse(endedAt) - Date.parse(row.occurred_at)),
        error: failure?.error ?? null,
      };
    })
    .reverse();
}

/** Una fila por Proyecto y skill, ordenadas por total descendente (AC-30). */
export function skillUsage(items: SkillInvocation[]): SkillUsage[] {
  const byKey = new Map<string, SkillUsage>();
  for (const item of items) {
    const key = `${item.project}\u0000${item.skill}`;
    const usage = byKey.get(key) ?? {
      project: item.project,
      skill: item.skill,
      total: 0,
      by_invoker: { agent: 0, subagent: 0, user: 0 },
      last_at: item.started_at,
    };
    usage.total += 1;
    usage.by_invoker[item.invoker] += 1;
    if (item.started_at > usage.last_at) usage.last_at = item.started_at;
    byKey.set(key, usage);
  }
  return [...byKey.values()].sort((a, b) => b.total - a.total || (a.last_at < b.last_at ? 1 : a.last_at > b.last_at ? -1 : 0));
}

/** Un `tool_use` de `Skill` leído del Transcript, con el resultado que volvió (AC-29). */
export interface TranscriptSkillUse {
  tool_use_id: string;
  skill: string;
  args: string | null;
  timestamp: string;
  error: string | null;
  failed: boolean;
}

type ContentBlock = { type?: unknown; id?: unknown; name?: unknown; input?: unknown; tool_use_id?: unknown; is_error?: unknown; content?: unknown };

function blocksOf(line: string): { timestamp: string | null; blocks: ContentBlock[] } | undefined {
  try {
    const entry = JSON.parse(line) as Record<string, unknown>;
    const content = record(entry.message)?.content;
    return { timestamp: text(entry.timestamp), blocks: Array.isArray(content) ? (content as ContentBlock[]) : [] };
  } catch {
    // El Transcript puede estar a medio escribir: la última línea se ignora.
    return undefined;
  }
}

const resultText = (content: unknown): string | null =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? (content.map((c) => record(c)?.text).find((t): t is string => typeof t === 'string') ?? null)
      : null;

/** Herramientas `Skill` de un Transcript JSONL (del agente principal o de un Subagente). */
export function parseSkillUses(jsonl: string): TranscriptSkillUse[] {
  const uses = new Map<string, TranscriptSkillUse>();
  for (const line of jsonl.split('\n')) {
    if (!line.includes('Skill') && !line.includes('tool_result')) continue;
    const parsed = blocksOf(line);
    if (!parsed) continue;
    for (const block of parsed.blocks) {
      if (block.type === 'tool_use' && block.name === SKILL_TOOL && typeof block.id === 'string' && parsed.timestamp) {
        const input = record(block.input);
        const skill = text(input?.skill);
        if (skill) uses.set(block.id, { tool_use_id: block.id, skill, args: firstLine(input?.args), timestamp: parsed.timestamp, error: null, failed: false });
      } else if (block.type === 'tool_result' && typeof block.tool_use_id === 'string' && block.is_error === true) {
        const use = uses.get(block.tool_use_id);
        if (use) {
          use.failed = true;
          use.error = firstLine(resultText(block.content));
        }
      }
    }
  }
  return [...uses.values()];
}

export interface TranscriptSkillSources {
  /** Filas de la Sesión en orden de llegada, con las pistas del repositorio (`tool_use_id`). */
  rows: SkillEventRow[];
  now: Date;
  /** Las ya derivadas de los Eventos: no se repiten. */
  fromEvents: SkillInvocation[];
  main: TranscriptSkillUse[];
  subagents: Array<{ agentId: string; agentType: string | null; uses: TranscriptSkillUse[] }>;
}

/**
 * Invocaciones que solo constan en los Transcripts (AC-29): las de los Subagentes
 * y las de tramos en que el hook no estaba activo. La más reciente primero.
 */
export function transcriptSkillInvocations({ rows, now, fromEvents, main, subagents }: TranscriptSkillSources): SkillInvocation[] {
  const first = rows[0];
  if (!first) return [];
  const core = summarizeSession(rows, now);
  const unfinishable = core.state === 'closed' || core.state === 'orphaned';
  const known = new Set(rows.filter((r) => r.tool_name === SKILL_TOOL && r.tool_use_id).map((r) => r.tool_use_id!));
  const prompts = rows.filter((r) => r.event_type === 'prompt.submitted' && r.subagent_id === null).map((r) => r.occurred_at);
  const turnAt = (ts: string) => {
    const n = prompts.filter((p) => p <= ts).length;
    return n === 0 ? null : n;
  };
  const userSkills = new Set(fromEvents.filter((i) => i.invoker === 'user').map((i) => `${i.turn}\u0000${i.skill}`));
  const stops = new Map(
    subagentLives(rows)
      .filter((l) => l.subagent_id !== null)
      .map((l) => [normalizeAgentId(l.subagent_id!), l.stopped_at]),
  );

  const toInvocation = (use: TranscriptSkillUse, subagent: { agentId: string; agentType: string | null } | null): SkillInvocation | undefined => {
    if (known.has(use.tool_use_id)) return undefined;
    const turn = turnAt(use.timestamp);
    // Una `/nombre` puede dejar también su `tool_use` en el Transcript: ya cuenta como de la persona usuaria.
    if (subagent === null && userSkills.has(`${turn}\u0000${use.skill}`)) return undefined;
    let endedAt: string | null = null;
    if (!use.failed) endedAt = subagent ? (stops.get(normalizeAgentId(subagent.agentId)) ?? null) : turn === null ? null : (core.turns[turn - 1]?.ended_at ?? null);
    // Un Subagente sin Eventos propios corrió sin hook: su fin no se conoce, pero ya no está en marcha.
    const knownSubagent = subagent === null || stops.has(normalizeAgentId(subagent.agentId));
    let status: SkillInvocationStatus = 'running';
    if (use.failed) status = 'failed';
    else if (endedAt !== null || unfinishable || !knownSubagent) status = 'finished';
    return {
      id: `transcript:${use.tool_use_id}`,
      event_id: null,
      project: core.project,
      directory: core.directory,
      session_id: core.session_id,
      subagent_id: subagent?.agentId ?? null,
      subagent_type: subagent?.agentType ?? null,
      turn,
      skill: use.skill,
      args: use.args,
      invoker: subagent ? 'subagent' : 'agent',
      status,
      started_at: use.timestamp,
      ended_at: endedAt,
      duration_ms: endedAt === null ? null : Math.max(0, Date.parse(endedAt) - Date.parse(use.timestamp)),
      error: use.error,
    };
  };

  return [
    ...main.map((u) => toInvocation(u, null)),
    ...subagents.flatMap((s) => s.uses.map((u) => toInvocation(u, s))),
  ]
    .filter((i): i is SkillInvocation => i !== undefined)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}
