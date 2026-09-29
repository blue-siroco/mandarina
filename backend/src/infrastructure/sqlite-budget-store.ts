import type Database from 'better-sqlite3';
import type { AllowanceRecord, BudgetRecord, BudgetStore } from '../application/ports.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS budgets (
    seq        INTEGER PRIMARY KEY AUTOINCREMENT,
    id         TEXT NOT NULL UNIQUE,
    scope      TEXT NOT NULL,
    project    TEXT,
    limit_usd  REAL NOT NULL,
    warn_ratio REAL NOT NULL,
    action     TEXT NOT NULL,
    enabled    INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS budget_allowances (
    id         TEXT PRIMARY KEY,
    budget_id  TEXT NOT NULL,
    session_id TEXT,
    project    TEXT,
    until      TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS budget_allowances_budget ON budget_allowances (budget_id);
`;

interface BudgetRow extends Omit<BudgetRecord, 'enabled'> {
  enabled: number;
}

const COLUMNS = 'id, scope, project, limit_usd, warn_ratio, action, enabled, created_at, updated_at';
const toRecord = (row: BudgetRow): BudgetRecord => ({ ...row, enabled: row.enabled === 1 });

/** Presupuestos y excepciones en la misma base que los Eventos (AC-76, AC-78). */
export class SqliteBudgetStore implements BudgetStore {
  constructor(private readonly db: Database.Database) {
    db.exec(SCHEMA);
  }

  list(): BudgetRecord[] {
    return this.db.prepare<[], BudgetRow>(`SELECT ${COLUMNS} FROM budgets ORDER BY seq`).all().map(toRecord);
  }

  find(id: string): BudgetRecord | undefined {
    const row = this.db.prepare<[string], BudgetRow>(`SELECT ${COLUMNS} FROM budgets WHERE id = ?`).get(id);
    return row ? toRecord(row) : undefined;
  }

  insert(record: BudgetRecord): void {
    this.db
      .prepare(`INSERT INTO budgets (${COLUMNS}) VALUES (@id, @scope, @project, @limit_usd, @warn_ratio, @action, @enabled, @created_at, @updated_at)`)
      .run({ ...record, enabled: record.enabled ? 1 : 0 });
  }

  update(record: BudgetRecord): void {
    this.db
      .prepare('UPDATE budgets SET scope = @scope, project = @project, limit_usd = @limit_usd, warn_ratio = @warn_ratio, action = @action, enabled = @enabled, updated_at = @updated_at WHERE id = @id')
      .run({ ...record, enabled: record.enabled ? 1 : 0 });
  }

  delete(id: string): boolean {
    this.db.prepare('DELETE FROM budget_allowances WHERE budget_id = ?').run(id);
    return this.db.prepare('DELETE FROM budgets WHERE id = ?').run(id).changes > 0;
  }

  allowances(): AllowanceRecord[] {
    return this.db
      .prepare<[], AllowanceRecord>('SELECT id, budget_id, session_id, project, until, created_at FROM budget_allowances ORDER BY created_at, id')
      .all();
  }

  addAllowance(record: AllowanceRecord): void {
    this.db
      .prepare('INSERT INTO budget_allowances (id, budget_id, session_id, project, until, created_at) VALUES (@id, @budget_id, @session_id, @project, @until, @created_at)')
      .run(record);
  }

  removeAllowance(budgetId: string, allowanceId: string): boolean {
    return this.db.prepare('DELETE FROM budget_allowances WHERE budget_id = ? AND id = ?').run(budgetId, allowanceId).changes > 0;
  }

  clearAllowances(budgetId: string): void {
    this.db.prepare('DELETE FROM budget_allowances WHERE budget_id = ?').run(budgetId);
  }
}
