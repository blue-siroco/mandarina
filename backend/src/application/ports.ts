import type { EventType, StoredEvent } from '../domain/event.js';
import type { BudgetInput } from '../domain/budget.js';
import type { EvaluationObjectType, Score } from '../domain/evaluation.js';
import type { SessionEventRow } from '../domain/session-summary.js';
import type { McpPostDigest } from '../domain/mcp-invocations.js';
import type { TranscriptSkillUse } from '../domain/skill-invocations.js';
import type { SubagentActivity, SubagentMeta } from '../domain/subagent-activity.js';
import type { UsageEntry } from '../domain/token-usage.js';

export interface EventQuery {
  limit: number;
  /** Solo Eventos recibidos antes del Evento con este id. */
  before?: string;
  sessionId?: string;
  project?: string;
  eventTypes?: EventType[];
  /** Solo Eventos recibidos desde esta fecha (ISO). */
  since?: string;
}

export interface SessionRowsFilter {
  /** Sesiones con algún Evento recibido desde esta fecha (ISO); sin ella, todas. */
  since?: string;
}

export interface ActivityCounts {
  events: number;
  tool_calls: number;
  prompts: number;
  blocks: number;
}

export interface EventRepository {
  save(event: StoredEvent): void;
  /** Más recientes primero. Devuelve `undefined` si `before` no existe. */
  list(query: EventQuery): StoredEvent[] | undefined;
  findById(id: string): StoredEvent | undefined;
  /** Todos los Eventos de una Sesión, en orden de llegada. */
  sessionEvents(sessionId: string): StoredEvent[];
  /** Eventos sin payload de las Sesiones del filtro, en orden de llegada. */
  sessionRows(filter: SessionRowsFilter): SessionEventRow[];
  /**
   * `tool.post` de `Bash` recibidos desde `since` (ISO) cuyo comando puede
   * lanzar tests, más recientes primero (ADR-0007).
   */
  testCandidates(since: string, limit: number): StoredEvent[];
  /**
   * Eventos recibidos desde `since` (ISO) que pueden ser Invocaciones de skill
   * o describen a un Subagente, más recientes primero (AC-29).
   */
  skillCandidates(since: string, limit: number): StoredEvent[];
  /** Eventos sin payload de estas Sesiones, en orden de llegada. */
  sessionRowsOf(sessionIds: string[]): SessionEventRow[];
  /**
   * Eventos de Herramientas MCP, de recursos MCP y de `ToolSearch` recibidos
   * desde `since` (ISO), más recientes primero (AC-41). Los `tool.post` MCP
   * llegan resumidos en `digest`, sin su respuesta.
   */
  mcpCandidates(since: string, limit: number): McpCandidate[];
  /** Proyecto de una Sesión con Eventos; `undefined` si no la hay (AC-55). */
  sessionContext(sessionId: string): { project: string } | undefined;
  /** Sesión y Proyecto de un Subagente con Eventos; `undefined` si no los hay (AC-55). */
  subagentContext(subagentId: string): { session_id: string; project: string } | undefined;
  /** `tool.post` vigilados (AC-63) con `seq` mayor que `afterSeq`, en orden de llegada. */
  injectionCandidates(afterSeq: number, limit: number): InjectionCandidate[];
  /** Marcadores `[REDACTED_…]` de los payloads recibidos desde `since` (ISO), por Proyecto (AC-65). */
  maskingCounts(since: string, types: readonly string[]): MaskingCounts[];
  /** Sesiones cuyo último Bloqueo lo produjo la regla `budget` (AC-84). */
  budgetStoppedSessions(): Set<string>;
}

export interface McpCandidate {
  id: string;
  session_id: string;
  payload?: Record<string, unknown>;
  digest?: McpPostDigest;
}

export interface EventPublisher {
  publish(event: StoredEvent): void;
}

export interface SubagentTranscript {
  /** Id del Subagente sin el prefijo `agent-`. */
  agentId: string;
  entries: UsageEntry[];
  /** `agent-<id>.meta.json`; `null` si no existe (versiones antiguas de Claude Code). */
  meta: SubagentMeta | null;
  activity: SubagentActivity;
  /** Herramientas `Skill` que usó (AC-29). */
  skills?: TranscriptSkillUse[];
}

export interface TranscriptData {
  mtimeMs: number;
  /** Respuestas del agente principal. */
  entries: UsageEntry[];
  /** Herramientas `Skill` del agente principal (AC-29). */
  skills?: TranscriptSkillUse[];
  subagents: SubagentTranscript[];
}

/** Lee un Transcript (y los de sus Subagentes) a partir de la ruta del host. */
export interface TranscriptReader {
  /** `undefined` si el Transcript no existe o no se puede leer. */
  read(transcriptPath: string): Promise<TranscriptData | undefined>;
  /**
   * Respuestas del agente principal y de sus Subagentes, sin deduplicar entre
   * ficheros, para el coste acumulado (ADR-0010). Lee solo lo añadido desde la
   * última llamada; `undefined` si el Transcript no existe.
   */
  readUsage(transcriptPath: string): Promise<UsageEntry[] | undefined>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

/** Estado de la Exportación OTLP de un Turno (ADR-0008). */
export type ExportState = 'pending' | 'exported' | 'failed';

export interface ExportRecord {
  /** Id del `prompt.submitted` que abre el Turno. */
  turn_id: string;
  session_id: string;
  project: string;
  state: ExportState;
  attempts: number;
  last_error: string | null;
  /** Cuándo se puede reintentar un Turno `pending`; `null` si aún no se ha intentado. */
  next_attempt_at: string | null;
  updated_at: string;
}

/** Persistencia del estado de la Exportación OTLP; sobrevive a los reinicios. */
export interface ExportStore {
  /** Desde cuándo exporta; la primera vez se fija en `now` (AC-51). */
  enabledSince(now: string): string;
  /** Los Turnos ya `exported` o `failed`, o `pending` pero con un intento hecho. */
  known(turnIds: string[]): Map<string, ExportRecord>;
  save(record: ExportRecord): void;
  counts(): Record<ExportState, number>;
  lastExportedAt(): string | null;
  /** Los cambiados más recientemente primero. */
  recent(limit: number): ExportRecord[];
}

export interface EvaluationRecord {
  object_type: EvaluationObjectType;
  object_id: string;
  session_id: string;
  project: string;
  score: Score | null;
  tags: string[];
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvaluationFilter {
  objectTypes?: EvaluationObjectType[];
  score?: 'up' | 'down' | 'none';
  tag?: string;
  project?: string;
  /** Solo Evaluaciones actualizadas desde este momento (ISO). */
  since?: string;
  /** La Sesión y sus Turnos y Subagentes. */
  sessionId?: string;
}

export interface EvaluationTagCount {
  tag: string;
  count: number;
}

/** Persistencia de las Evaluaciones; no son Eventos y viven en su propia tabla (AC-54). */
export interface EvaluationStore {
  /** Crea o sustituye; conserva `created_at` si ya existía. */
  put(record: Omit<EvaluationRecord, 'created_at' | 'updated_at'>, now: string): EvaluationRecord;
  delete(objectType: EvaluationObjectType, objectId: string): boolean;
  /** La actualizada más recientemente primero. */
  list(filter?: EvaluationFilter): EvaluationRecord[];
  /** Todas las Etiquetas usadas, por uso y luego alfabéticamente. */
  tagCounts(): EvaluationTagCount[];
  projects(): string[];
  /** Puntuación de la Evaluación de cada Sesión evaluada. */
  sessionScores(): Map<string, Score | null>;
  /** Puntuación de la Evaluación de cada Subagente evaluado. */
  subagentScores(): Map<string, Score | null>;
}

/** `tool.post` de una herramienta que lee contenido externo, con lo que devolvió (AC-63). */
export interface InjectionCandidate {
  seq: number;
  id: string;
  session_id: string;
  project: string;
  subagent_id: string | null;
  tool_name: string;
  occurred_at: string;
  received_at: string;
  tool_input: unknown;
  /** Respuesta de la herramienta como texto, recortada. */
  response: string;
}

/** Marcadores de Enmascarado de un Proyecto (AC-65). */
export interface MaskingCounts {
  project: string;
  counts: Record<string, number>;
}

/** Avisos de inyección descartados como falsos positivos; sobreviven a los reinicios (AC-64). */
export interface DismissalStore {
  all(): Set<string>;
  add(id: string, now: string): void;
  remove(id: string): void;
}

/** Un Presupuesto guardado (AC-76). */
export interface BudgetRecord extends BudgetInput {
  id: string;
  created_at: string;
  updated_at: string;
}

/** Excepción que deja seguir a una Sesión o a un Proyecto sin cambiar el Presupuesto (AC-78). */
export interface AllowanceRecord {
  id: string;
  budget_id: string;
  session_id: string | null;
  project: string | null;
  /** Fin de la excepción; `null` mientras dure la Sesión. */
  until: string | null;
  created_at: string;
}

/** Persistencia de los Presupuestos y sus excepciones; sobrevive a los reinicios. */
export interface BudgetStore {
  /** Por orden de creación. */
  list(): BudgetRecord[];
  find(id: string): BudgetRecord | undefined;
  insert(record: BudgetRecord): void;
  update(record: BudgetRecord): void;
  /** Borra el Presupuesto y sus excepciones; `false` si no existe. */
  delete(id: string): boolean;
  allowances(): AllowanceRecord[];
  addAllowance(record: AllowanceRecord): void;
  removeAllowance(budgetId: string, allowanceId: string): boolean;
  clearAllowances(budgetId: string): void;
}

/** Difunde un mensaje a todos los clientes del WebSocket (AC-81). */
export interface Broadcaster {
  broadcast(message: unknown): void;
}
