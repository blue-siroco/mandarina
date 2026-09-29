// Agregados de la pantalla de Bloqueos (spec/design.md §6.4).
import { ObservedEvent } from '../../events/models/observed-event';
import { BLOCK_WINDOW_DAYS, windowStart } from './watch-blocks';

export interface DayStack {
  day: Date;
  total: number;
  /** En el orden de `rules`, con 0 donde no hubo Bloqueos. */
  counts: number[];
}

export interface BlockStats {
  today: number;
  week: number;
  topRule: { rule: string; count: number } | null;
  sessions: number;
  /** Reglas por frecuencia: fija el color de cada una en barras y leyenda. */
  rules: string[];
  days: DayStack[];
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function blockStats(blocks: ObservedEvent[], now: Date, days = BLOCK_WINDOW_DAYS): BlockStats {
  const start = windowStart(now, days);
  const inWindow = blocks.filter((b) => b.block && b.occurredAt >= start);
  const todayStart = windowStart(now, 1);

  const perRule = new Map<string, number>();
  for (const b of inWindow) perRule.set(b.block!.rule, (perRule.get(b.block!.rule) ?? 0) + 1);
  const rules = [...perRule].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([rule]) => rule);
  const top = rules[0];

  const stacks = Array.from({ length: days }, (_, i) => {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { day, total: 0, counts: rules.map(() => 0) };
  });
  const byKey = new Map(stacks.map((s) => [dayKey(s.day), s]));
  for (const b of inWindow) {
    const stack = byKey.get(dayKey(b.occurredAt));
    if (!stack) continue;
    stack.total += 1;
    stack.counts[rules.indexOf(b.block!.rule)]! += 1;
  }

  return {
    today: inWindow.filter((b) => b.occurredAt >= todayStart).length,
    week: inWindow.length,
    topRule: top ? { rule: top, count: perRule.get(top)! } : null,
    sessions: new Set(inWindow.map((b) => b.sessionId)).size,
    rules,
    days: stacks,
  };
}

/** Color estable por posición de la Regla (§3.4). */
export function ruleColor(index: number): string {
  return index < 6 ? `var(--series-${index + 1})` : 'var(--series-other)';
}
