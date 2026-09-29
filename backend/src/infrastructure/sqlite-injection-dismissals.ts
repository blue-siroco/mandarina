import type Database from 'better-sqlite3';
import type { DismissalStore } from '../application/ports.js';

/** Descartes de Avisos de inyección en la misma base que los Eventos (AC-64). */
export class SqliteInjectionDismissals implements DismissalStore {
  constructor(private readonly db: Database.Database) {
    db.exec('CREATE TABLE IF NOT EXISTS injection_dismissals (warning_id TEXT PRIMARY KEY, dismissed_at TEXT NOT NULL)');
  }

  all(): Set<string> {
    return new Set(this.db.prepare<[], { warning_id: string }>('SELECT warning_id FROM injection_dismissals').all().map((r) => r.warning_id));
  }

  add(id: string, now: string): void {
    this.db.prepare('INSERT OR IGNORE INTO injection_dismissals (warning_id, dismissed_at) VALUES (?, ?)').run(id, now);
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM injection_dismissals WHERE warning_id = ?').run(id);
  }
}
