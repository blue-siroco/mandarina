import type Database from 'better-sqlite3';
import type { EvaluationFilter, EvaluationRecord, EvaluationStore, EvaluationTagCount } from '../application/ports.js';
import type { EvaluationObjectType, Score } from '../domain/evaluation.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS evaluations (
    seq         INTEGER PRIMARY KEY AUTOINCREMENT,
    object_type TEXT NOT NULL,
    object_id   TEXT NOT NULL,
    session_id  TEXT NOT NULL,
    project     TEXT NOT NULL,
    score       INTEGER,
    tags        TEXT NOT NULL,
    note        TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    UNIQUE (object_type, object_id)
  );
  CREATE INDEX IF NOT EXISTS evaluations_session ON evaluations (session_id);
`;

interface Row extends Omit<EvaluationRecord, 'tags' | 'score'> {
  score: number | null;
  tags: string;
}

const COLUMNS = 'object_type, object_id, session_id, project, score, tags, note, created_at, updated_at';

const toRecord = (row: Row): EvaluationRecord => ({ ...row, score: row.score as Score | null, tags: JSON.parse(row.tags) as string[] });

/** Evaluaciones en la misma base que los Eventos, en su propia tabla (AC-54). */
export class SqliteEvaluationStore implements EvaluationStore {
  constructor(private readonly db: Database.Database) {
    db.exec(SCHEMA);
  }

  put(record: Omit<EvaluationRecord, 'created_at' | 'updated_at'>, now: string): EvaluationRecord {
    // `seq` se renueva al editar para que "la actualizada más recientemente" desempate por orden real.
    this.db
      .prepare(
        `INSERT INTO evaluations (${COLUMNS}) VALUES (@object_type, @object_id, @session_id, @project, @score, @tags, @note, @now, @now)
         ON CONFLICT (object_type, object_id) DO UPDATE SET session_id = @session_id, project = @project, score = @score,
           tags = @tags, note = @note, updated_at = @now, seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM evaluations)`,
      )
      .run({ ...record, tags: JSON.stringify(record.tags), now });
    return toRecord(
      this.db.prepare<[string, string], Row>(`SELECT ${COLUMNS} FROM evaluations WHERE object_type = ? AND object_id = ?`).get(record.object_type, record.object_id)!,
    );
  }

  delete(objectType: EvaluationObjectType, objectId: string): boolean {
    return this.db.prepare('DELETE FROM evaluations WHERE object_type = ? AND object_id = ?').run(objectType, objectId).changes > 0;
  }

  list({ objectTypes, score, tag, project, since, sessionId }: EvaluationFilter = {}): EvaluationRecord[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (objectTypes !== undefined && objectTypes.length > 0) {
      where.push(`object_type IN (${objectTypes.map(() => '?').join(', ')})`);
      params.push(...objectTypes);
    }
    if (score === 'up') where.push('score = 1');
    if (score === 'down') where.push('score = -1');
    if (score === 'none') where.push('score IS NULL');
    if (tag !== undefined) {
      where.push('EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)');
      params.push(tag);
    }
    if (project !== undefined) {
      where.push('project = ?');
      params.push(project);
    }
    if (since !== undefined) {
      where.push('updated_at >= ?');
      params.push(since);
    }
    if (sessionId !== undefined) {
      where.push('session_id = ?');
      params.push(sessionId);
    }
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    return this.db
      .prepare<unknown[], Row>(`SELECT ${COLUMNS} FROM evaluations ${clause} ORDER BY seq DESC`)
      .all(...params)
      .map(toRecord);
  }

  tagCounts(): EvaluationTagCount[] {
    return this.db
      .prepare<[], EvaluationTagCount>(
        'SELECT value AS tag, COUNT(*) AS count FROM evaluations, json_each(evaluations.tags) GROUP BY value ORDER BY count DESC, tag ASC',
      )
      .all();
  }

  projects(): string[] {
    return this.db.prepare<[], { project: string }>('SELECT DISTINCT project FROM evaluations ORDER BY project').all().map((r) => r.project);
  }

  sessionScores(): Map<string, Score | null> {
    return this.scores('session');
  }

  subagentScores(): Map<string, Score | null> {
    return this.scores('subagent');
  }

  private scores(objectType: EvaluationObjectType): Map<string, Score | null> {
    const rows = this.db
      .prepare<[string], { object_id: string; score: number | null }>('SELECT object_id, score FROM evaluations WHERE object_type = ?')
      .all(objectType);
    return new Map(rows.map((r) => [r.object_id, r.score as Score | null]));
  }
}
