import type Database from 'better-sqlite3';
import type { ExportRecord, ExportState, ExportStore } from '../application/ports.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS otlp_exports (
    seq             INTEGER PRIMARY KEY AUTOINCREMENT,
    turn_id         TEXT NOT NULL UNIQUE,
    session_id      TEXT NOT NULL,
    project         TEXT NOT NULL,
    state           TEXT NOT NULL,
    attempts        INTEGER NOT NULL,
    last_error      TEXT,
    next_attempt_at TEXT,
    updated_at      TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS otlp_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

const COLUMNS = 'turn_id, session_id, project, state, attempts, last_error, next_attempt_at, updated_at';

/** Estado de la Exportación OTLP en la misma base que los Eventos (ADR-0008). */
export class SqliteExportStore implements ExportStore {
  constructor(private readonly db: Database.Database) {
    db.exec(SCHEMA);
  }

  enabledSince(now: string): string {
    this.db.prepare("INSERT OR IGNORE INTO otlp_meta (key, value) VALUES ('enabled_since', ?)").run(now);
    return (this.db.prepare("SELECT value FROM otlp_meta WHERE key = 'enabled_since'").get() as { value: string }).value;
  }

  known(turnIds: string[]): Map<string, ExportRecord> {
    const result = new Map<string, ExportRecord>();
    // SQLite limita las variables de una consulta: por lotes.
    for (let i = 0; i < turnIds.length; i += 500) {
      const batch = turnIds.slice(i, i + 500);
      const rows = this.db
        .prepare<string[], ExportRecord>(`SELECT ${COLUMNS} FROM otlp_exports WHERE turn_id IN (${batch.map(() => '?').join(', ')})`)
        .all(...batch);
      for (const row of rows) result.set(row.turn_id, row);
    }
    return result;
  }

  save(record: ExportRecord): void {
    this.db
      .prepare(
        `INSERT INTO otlp_exports (${COLUMNS}) VALUES (@turn_id, @session_id, @project, @state, @attempts, @last_error, @next_attempt_at, @updated_at)
         ON CONFLICT (turn_id) DO UPDATE SET state = @state, attempts = @attempts, last_error = @last_error,
           next_attempt_at = @next_attempt_at, updated_at = @updated_at, seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM otlp_exports)`,
      )
      .run(record);
  }

  counts(): Record<ExportState, number> {
    const counts: Record<ExportState, number> = { pending: 0, exported: 0, failed: 0 };
    const rows = this.db.prepare('SELECT state, COUNT(*) AS n FROM otlp_exports GROUP BY state').all() as Array<{
      state: ExportState;
      n: number;
    }>;
    for (const row of rows) counts[row.state] = row.n;
    return counts;
  }

  lastExportedAt(): string | null {
    const row = this.db.prepare("SELECT MAX(updated_at) AS at FROM otlp_exports WHERE state = 'exported'").get() as { at: string | null };
    return row.at;
  }

  recent(limit: number): ExportRecord[] {
    return this.db.prepare<[number], ExportRecord>(`SELECT ${COLUMNS} FROM otlp_exports ORDER BY seq DESC LIMIT ?`).all(limit);
  }
}
