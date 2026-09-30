import type Database from 'better-sqlite3';
import type { SubscriptionUsageStore } from '../application/ports.js';
import type { StoredUsage, StoredWindow } from '../domain/subscription-usage.js';

// Una sola fila (`id = 1`): el dato es la última lectura de la cuenta, no un histórico (ADR-0012).
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS subscription_usage (
    id                   INTEGER PRIMARY KEY CHECK (id = 1),
    five_hour_used       REAL,
    five_hour_resets_at  TEXT,
    seven_day_used       REAL,
    seven_day_resets_at  TEXT,
    updated_at           TEXT NOT NULL
  );
`;

interface Row {
  five_hour_used: number | null;
  five_hour_resets_at: string | null;
  seven_day_used: number | null;
  seven_day_resets_at: string | null;
  updated_at: string;
}

const window = (used: number | null, resetsAt: string | null): StoredWindow | null =>
  used === null || resetsAt === null ? null : { used_percent: used, resets_at: resetsAt };

/** Última lectura de la cuota de la suscripción, en la misma base que los Eventos (AC-130). */
export class SqliteSubscriptionUsageStore implements SubscriptionUsageStore {
  constructor(private readonly db: Database.Database) {
    db.exec(SCHEMA);
  }

  get(): StoredUsage | null {
    const row = this.db.prepare<[], Row>('SELECT * FROM subscription_usage WHERE id = 1').get();
    if (!row) return null;
    return {
      five_hour: window(row.five_hour_used, row.five_hour_resets_at),
      seven_day: window(row.seven_day_used, row.seven_day_resets_at),
      updated_at: row.updated_at,
    };
  }

  save(usage: StoredUsage): void {
    this.db
      .prepare(
        `INSERT INTO subscription_usage (id, five_hour_used, five_hour_resets_at, seven_day_used, seven_day_resets_at, updated_at)
         VALUES (1, @five_used, @five_resets, @seven_used, @seven_resets, @updated_at)
         ON CONFLICT (id) DO UPDATE SET
           five_hour_used = excluded.five_hour_used,
           five_hour_resets_at = excluded.five_hour_resets_at,
           seven_day_used = excluded.seven_day_used,
           seven_day_resets_at = excluded.seven_day_resets_at,
           updated_at = excluded.updated_at`,
      )
      .run({
        five_used: usage.five_hour?.used_percent ?? null,
        five_resets: usage.five_hour?.resets_at ?? null,
        seven_used: usage.seven_day?.used_percent ?? null,
        seven_resets: usage.seven_day?.resets_at ?? null,
        updated_at: usage.updated_at,
      });
  }
}
