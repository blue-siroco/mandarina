import Database from 'better-sqlite3';
import type { Block, EventType, StoredEvent } from '../domain/event.js';
import type { EventQuery, EventRepository, InjectionCandidate, MaskingCounts, McpCandidate, SessionRowsFilter } from '../application/ports.js';
import type { McpPostDigest } from '../domain/mcp-invocations.js';
import type { SessionEventRow } from '../domain/session-summary.js';

interface EventRow {
  id: string;
  schema_version: number;
  harness: string;
  project: string;
  directory: string;
  session_id: string;
  subagent_id: string | null;
  event_type: EventType;
  native_event_type: string;
  tool_name: string | null;
  occurred_at: string;
  received_at: string;
  transcript_path: string | null;
  payload: string;
  block: string | null;
}

// `seq` fija el orden de llegada: `received_at` puede empatar en el mismo
// milisegundo y el `id` (UUID) no es ordenable.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS events (
    seq               INTEGER PRIMARY KEY AUTOINCREMENT,
    id                TEXT NOT NULL UNIQUE,
    schema_version    INTEGER NOT NULL,
    harness           TEXT NOT NULL,
    project           TEXT NOT NULL,
    directory         TEXT NOT NULL,
    session_id        TEXT NOT NULL,
    subagent_id       TEXT,
    event_type        TEXT NOT NULL,
    native_event_type TEXT NOT NULL,
    tool_name         TEXT,
    occurred_at       TEXT NOT NULL,
    received_at       TEXT NOT NULL,
    transcript_path   TEXT,
    payload           TEXT NOT NULL,
    block             TEXT
  );
  CREATE INDEX IF NOT EXISTS events_session ON events (session_id, seq);
  CREATE INDEX IF NOT EXISTS events_project ON events (project, seq);
  CREATE INDEX IF NOT EXISTS events_received ON events (received_at);
  CREATE INDEX IF NOT EXISTS events_type ON events (event_type, seq);
`;

// `received_at` es ISO 8601 en UTC con milisegundos: se compara como texto.
// Un Subagente sigue en marcha si arrancó y no hay un `subagent.stopped` con su id.
// Sin `payload`: el board resume muchas Sesiones y el payload puede pesar megas.
// Pistas del payload para el ciclo de vida de los Subagentes (AC-33); `hintsOf`
// (dominio) calcula lo mismo a partir de un payload completo.
const LAUNCH = "tool_name IN ('Agent', 'Task')";
// Campos de `tool_input` que resume `summarizeToolInput` (tool-summary.ts).
const PERMISSION_FIELDS = ['command', 'file_path', 'notebook_path', 'pattern', 'url', 'query', 'description', 'skill']
  .map((field) => `'${field}', substr(json_extract(payload, '$.tool_input.${field}'), 1, 300)`)
  .join(', ');
const HINT_COLUMNS = [
  "CASE WHEN event_type LIKE 'subagent.%' THEN json_extract(payload, '$.agent_type') END AS agent_type",
  "json_extract(payload, '$.tool_use_id') AS tool_use_id",
  `CASE WHEN event_type = 'tool.pre' AND ${LAUNCH} THEN json_extract(payload, '$.tool_input.subagent_type') END AS launch_type`,
  `CASE WHEN event_type = 'tool.pre' AND ${LAUNCH} THEN json_extract(payload, '$.tool_input.description') END AS launch_description`,
  `CASE WHEN event_type = 'tool.post' AND ${LAUNCH} THEN json_extract(payload, '$.tool_response.agentId') END AS launched_agent_id`,
  `CASE WHEN event_type = 'tool.post' AND ${LAUNCH} THEN json_extract(payload, '$.tool_response.status') END AS response_status`,
  `CASE WHEN event_type = 'tool.pre' AND ${LAUNCH} THEN coalesce(json_extract(payload, '$.tool_input.run_in_background'), 0) = 1 ELSE 0 END AS launch_background`,
  "CASE WHEN event_type = 'tool.post' AND coalesce(json_extract(payload, '$.error'), '') <> '' AND coalesce(json_extract(payload, '$.is_interrupt'), 0) <> 1 THEN 1 ELSE 0 END AS tool_error",
  "CASE WHEN event_type = 'tool.pre' AND tool_name = 'Skill' THEN json_extract(payload, '$.tool_input.skill') END AS skill_name",
  "CASE WHEN subagent_id IS NULL AND event_type NOT LIKE 'subagent.%' THEN json_extract(payload, '$.agent_type') END AS session_agent_type",
  // Esperas (ADR-0011): solo lo que resume la espera, recortado para no cargar entradas enormes (un Write).
  "CASE WHEN event_type = 'session.notified' THEN json_extract(payload, '$.notification_type') END AS notification_type",
  "CASE WHEN event_type = 'session.notified' THEN substr(json_extract(payload, '$.message'), 1, 300) END AS wait_message",
  `CASE WHEN event_type = 'permission.requested' THEN json_object(${PERMISSION_FIELDS}) END AS permission_input`,
  "CASE WHEN event_type = 'tool.pre' AND tool_name = 'AskUserQuestion' THEN substr(json_extract(payload, '$.tool_input.questions[0].question'), 1, 300) END AS wait_question",
].join(', ');
const ROW_COLUMNS = `id, session_id, project, directory, harness, subagent_id, event_type, tool_name, occurred_at, received_at, transcript_path, ${HINT_COLUMNS}`;

const COLUMNS =
  'id, schema_version, harness, project, directory, session_id, subagent_id, event_type, native_event_type, tool_name, occurred_at, received_at, transcript_path, payload, block';

// Primer filtro barato en SQL; `runsTests` (dominio) decide al leer el payload.
const TEST_COMMAND = "json_extract(payload, '$.tool_input.command')";
const TEST_CANDIDATES = `
  SELECT ${COLUMNS} FROM events
  WHERE event_type = 'tool.post' AND tool_name = 'Bash' AND received_at >= ?
    AND (${['test', 'spec', 'e2e', 'jest', 'playwright'].map((word) => `${TEST_COMMAND} LIKE '%${word}%'`).join(' OR ')})
  ORDER BY seq DESC LIMIT ?
`;

// Invocaciones de skill (AC-29): la herramienta `Skill`, los prompts que empiezan
// por `/` (el dominio descarta las rutas) y los Subagentes, para leer su tipo.
const SKILL_CANDIDATES = `
  SELECT ${COLUMNS} FROM events
  WHERE received_at >= ? AND (
    (tool_name = 'Skill' AND event_type IN ('tool.pre', 'tool.post'))
    OR (event_type = 'prompt.submitted' AND ltrim(json_extract(payload, '$.prompt')) LIKE '/%')
    OR event_type IN ('subagent.started', 'subagent.stopped')
  )
  ORDER BY seq DESC LIMIT ?
`;

// Herramientas MCP (AC-41). Un `tool.post` MCP puede traer una captura en base64
// de ~120 KB: se resume aquí (`digestOf` del dominio calcula lo mismo en memoria).
const MCP_TOOLS = "(tool_name LIKE 'mcp\\_\\_%' ESCAPE '\\' OR tool_name IN ('ListMcpResourcesTool', 'ReadMcpResourceTool', 'ToolSearch'))";
const MCP_POST = "event_type = 'tool.post' AND tool_name <> 'ToolSearch'";
const RESPONSE = "json_extract(payload, '$.tool_response')";
const MCP_CANDIDATES = `
  SELECT id, session_id,
    CASE WHEN ${MCP_POST} THEN NULL ELSE payload END AS payload,
    CASE WHEN ${MCP_POST} THEN json_object(
      'tool_use_id', json_extract(payload, '$.tool_use_id'),
      'duration_ms', json_extract(payload, '$.duration_ms'),
      'is_interrupt', json_extract(payload, '$.is_interrupt'),
      'error', json_extract(payload, '$.error'),
      'response_bytes', CASE WHEN coalesce(json_type(payload, '$.tool_response'), 'null') = 'null' THEN NULL
        ELSE length(CAST(${RESPONSE} AS BLOB)) END,
      'has_image', CASE WHEN json_type(payload, '$.tool_response') = 'array'
        THEN EXISTS (SELECT 1 FROM json_each(${RESPONSE}) WHERE json_extract(value, '$.type') = 'image') ELSE 0 END
    ) END AS digest
  FROM events
  WHERE received_at >= ? AND event_type IN ('tool.pre', 'tool.post', 'tool.blocked') AND ${MCP_TOOLS}
  ORDER BY seq DESC LIMIT ?
`;

interface McpCandidateRow {
  id: string;
  session_id: string;
  payload: string | null;
  digest: string | null;
}

function toDigest(json: string): McpPostDigest {
  const raw = JSON.parse(json) as Record<string, unknown>;
  const error = typeof raw.error === 'string' && raw.error.trim() !== '' ? raw.error.trim().split('\n')[0]!.trim() : null;
  return {
    tool_use_id: typeof raw.tool_use_id === 'string' ? raw.tool_use_id : null,
    duration_ms: typeof raw.duration_ms === 'number' && raw.duration_ms >= 0 ? Math.round(raw.duration_ms) : null,
    is_interrupt: raw.is_interrupt === true || raw.is_interrupt === 1,
    error,
    response_bytes: typeof raw.response_bytes === 'number' ? raw.response_bytes : null,
    has_image: raw.has_image === 1 || raw.has_image === true,
  };
}

// Respuestas de las herramientas que leen contenido externo (AC-63). Solo los `PostToolUse`:
// un `PostToolUseFailure` no trae respuesta. El texto se recorta para no cargar megas en memoria.
const INJECTION_COMMAND = "json_extract(payload, '$.tool_input.command')";
const INJECTION_MCP = "tool_name LIKE 'mcp\\_\\_%' ESCAPE '\\'";
const INJECTION_CANDIDATES = `
  SELECT seq, id, session_id, project, subagent_id, tool_name, occurred_at, received_at,
    json_extract(payload, '$.tool_input') AS tool_input,
    substr(CAST(json_extract(payload, '$.tool_response') AS TEXT), 1, 200000) AS response
  FROM events
  WHERE seq > ? AND event_type = 'tool.post' AND native_event_type = 'PostToolUse'
    AND json_extract(payload, '$.tool_response') IS NOT NULL
    AND (
      tool_name IN ('WebFetch', 'WebSearch', 'Read')
      OR ${INJECTION_MCP}
      OR (tool_name = 'Bash' AND (${INJECTION_COMMAND} LIKE '%curl%' OR ${INJECTION_COMMAND} LIKE '%wget%'))
    )
  ORDER BY seq LIMIT ?
`;

interface InjectionRow extends Omit<InjectionCandidate, 'tool_input'> {
  tool_input: string | null;
}

type RawRow = Omit<SessionEventRow, 'launch_background' | 'tool_error' | 'permission_input'> & {
  launch_background: 0 | 1;
  tool_error: 0 | 1;
  permission_input: string | null;
};
const toRow = (row: RawRow): SessionEventRow => ({
  ...row,
  launch_background: row.launch_background === 1,
  tool_error: row.tool_error === 1,
  permission_input: parseJson(row.permission_input) as Record<string, unknown> | null,
});

export class SqliteEventRepository implements EventRepository {
  private readonly db: Database.Database;
  private readonly insert: Database.Statement;
  private readonly exists: Database.Statement<[string], { seq: number }>;
  private readonly byId: Database.Statement<[string], EventRow>;
  private readonly bySession: Database.Statement<[string], EventRow>;
  private readonly tests: Database.Statement<[string, number], EventRow>;
  private readonly skills: Database.Statement<[string, number], EventRow>;
  private readonly mcp: Database.Statement<[string, number], McpCandidateRow>;
  private readonly injection: Database.Statement<[number, number], InjectionRow>;

  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
    this.insert = this.db.prepare(
      `INSERT INTO events (${COLUMNS}) VALUES (@id, @schema_version, @harness, @project, @directory, @session_id, @subagent_id, @event_type, @native_event_type, @tool_name, @occurred_at, @received_at, @transcript_path, @payload, @block)`,
    );
    this.exists = this.db.prepare('SELECT seq FROM events WHERE id = ?');
    this.byId = this.db.prepare(`SELECT ${COLUMNS} FROM events WHERE id = ?`);
    this.bySession = this.db.prepare(`SELECT ${COLUMNS} FROM events WHERE session_id = ? ORDER BY seq`);
    this.tests = this.db.prepare(TEST_CANDIDATES);
    this.skills = this.db.prepare(SKILL_CANDIDATES);
    this.mcp = this.db.prepare(MCP_CANDIDATES);
    this.injection = this.db.prepare(INJECTION_CANDIDATES);
  }

  /** Las bases creadas antes de la rebanada 4 no tienen la columna `block` (ADR-0006). */
  private migrate(): void {
    const exists = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'events'").get();
    if (exists) {
      const columns = this.db.prepare('PRAGMA table_info(events)').all() as Array<{ name: string }>;
      if (!columns.some((c) => c.name === 'block')) this.db.exec('ALTER TABLE events ADD COLUMN block TEXT');
    }
    this.db.exec(SCHEMA);
  }

  save(event: StoredEvent): void {
    this.insert.run({
      ...event,
      payload: JSON.stringify(event.payload),
      block: event.block ? JSON.stringify(event.block) : null,
    });
  }

  list({ limit, before, sessionId, eventTypes, since }: EventQuery): StoredEvent[] | undefined {
    const where: string[] = [];
    const params: unknown[] = [];
    if (before !== undefined) {
      const anchor = this.exists.get(before);
      if (!anchor) return undefined;
      where.push('seq < ?');
      params.push(anchor.seq);
    }
    if (sessionId !== undefined) {
      where.push('session_id = ?');
      params.push(sessionId);
    }
    if (eventTypes !== undefined && eventTypes.length > 0) {
      where.push(`event_type IN (${eventTypes.map(() => '?').join(', ')})`);
      params.push(...eventTypes);
    }
    if (since !== undefined) {
      where.push('received_at >= ?');
      params.push(since);
    }
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = this.db
      .prepare<unknown[], EventRow>(`SELECT ${COLUMNS} FROM events ${clause} ORDER BY seq DESC LIMIT ?`)
      .all(...params, limit);
    return rows.map(toEvent);
  }

  findById(id: string): StoredEvent | undefined {
    const row = this.byId.get(id);
    return row ? toEvent(row) : undefined;
  }

  sessionEvents(sessionId: string): StoredEvent[] {
    return this.bySession.all(sessionId).map(toEvent);
  }

  sessionRows({ since }: SessionRowsFilter): SessionEventRow[] {
    // Todas las filas de las Sesiones con actividad desde `since`, no solo las
    // posteriores: las duraciones y los contadores son de la Sesión entera.
    const sessionFilter =
      since === undefined
        ? ''
        : 'WHERE session_id IN (SELECT session_id FROM events GROUP BY session_id HAVING MAX(received_at) >= ?)';
    return this.db
      .prepare<unknown[], RawRow>(`SELECT ${ROW_COLUMNS} FROM events ${sessionFilter} ORDER BY seq`)
      .all(...(since === undefined ? [] : [since]))
      .map(toRow);
  }

  testCandidates(since: string, limit: number): StoredEvent[] {
    return this.tests.all(since, limit).map(toEvent);
  }

  skillCandidates(since: string, limit: number): StoredEvent[] {
    return this.skills.all(since, limit).map(toEvent);
  }

  mcpCandidates(since: string, limit: number): McpCandidate[] {
    return this.mcp.all(since, limit).map((row) => ({
      id: row.id,
      session_id: row.session_id,
      ...(row.payload === null ? {} : { payload: JSON.parse(row.payload) as Record<string, unknown> }),
      ...(row.digest === null ? {} : { digest: toDigest(row.digest) }),
    }));
  }

  sessionRowsOf(sessionIds: string[]): SessionEventRow[] {
    if (sessionIds.length === 0) return [];
    return this.db
      .prepare<string[], RawRow>(
        `SELECT ${ROW_COLUMNS} FROM events WHERE session_id IN (${sessionIds.map(() => '?').join(', ')}) ORDER BY seq`,
      )
      .all(...sessionIds)
      .map(toRow);
  }

  injectionCandidates(afterSeq: number, limit: number): InjectionCandidate[] {
    return this.injection.all(afterSeq, limit).map((row) => ({ ...row, tool_input: parseJson(row.tool_input) }));
  }

  maskingCounts(since: string, types: readonly string[]): MaskingCounts[] {
    // Ocurrencias, no Eventos: la longitud del payload antes y después de quitar el marcador.
    const sums = types.map((type) => {
      const marker = `[REDACTED_${type}]`;
      return `COALESCE(SUM((length(payload) - length(replace(payload, '${marker}', ''))) / ${marker.length}), 0) AS "${type}"`;
    });
    const rows = this.db
      .prepare<[string], Record<string, string | number>>(`SELECT project, ${sums.join(', ')} FROM events WHERE received_at >= ? GROUP BY project`)
      .all(since);
    return rows.map((row) => ({
      project: String(row.project),
      counts: Object.fromEntries(types.map((type) => [type, Number(row[type])])),
    }));
  }

  budgetStoppedSessions(): Set<string> {
    const rows = this.db
      .prepare<[], { session_id: string }>(
        `SELECT e.session_id FROM events e
         WHERE e.event_type = 'tool.blocked' AND json_extract(e.block, '$.rule') = 'budget'
           AND e.seq = (SELECT MAX(x.seq) FROM events x WHERE x.session_id = e.session_id AND x.event_type = 'tool.blocked')`,
      )
      .all();
    return new Set(rows.map((r) => r.session_id));
  }

  sessionContext(sessionId: string): { project: string } | undefined {
    return this.db.prepare<[string], { project: string }>('SELECT project FROM events WHERE session_id = ? ORDER BY seq DESC LIMIT 1').get(sessionId);
  }

  subagentContext(subagentId: string): { session_id: string; project: string } | undefined {
    return this.db
      .prepare<[string], { session_id: string; project: string }>('SELECT session_id, project FROM events WHERE subagent_id = ? ORDER BY seq DESC LIMIT 1')
      .get(subagentId);
  }

  /** Conexión compartida con los demás almacenes (p. ej. el estado de la Exportación OTLP). */
  get connection(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toEvent(row: EventRow): StoredEvent {
  return {
    ...row,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    block: row.block ? (JSON.parse(row.block) as Block) : null,
  };
}
