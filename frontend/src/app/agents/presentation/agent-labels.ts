// Textos y cálculos de presentación de los agentes (spec/design.md §6.4f).
import { AgentLaunch, LaunchStatus } from '../models/agent';

/** El estado siempre se dice con texto, no solo con color (spec/design.md §7). */
export const STATUS_LABELS: Record<LaunchStatus, string> = {
  running: 'En marcha',
  finished: 'Terminado',
  no_response: 'Sin respuesta',
};

export const typeLabel = (type: string | null) => type ?? 'Sin Tipo';

const perLaunch = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
export const formatPerLaunch = (n: number) => perLaunch.format(n);

/** Parte de los Lanzamientos puntuados que salió bien (0–1); `null` si ninguno tiene Puntuación (AC-59). */
export function ratedUpRatio(summary: { ratedUp: number; ratedDown: number }): number | null {
  const rated = summary.ratedUp + summary.ratedDown;
  return rated === 0 ? null : summary.ratedUp / rated;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/**
 * Lanzamientos por día local, del primer día del periodo (o del primer
 * Lanzamiento, sin periodo) a hoy, con los días sin Lanzamientos a cero.
 */
export function launchesByDay(launches: readonly AgentLaunch[], now: Date, windowMs?: number): Array<{ label: string; value: number }> {
  const counts = new Map<string, number>();
  for (const l of launches) counts.set(dayKey(l.startedAt), (counts.get(dayKey(l.startedAt)) ?? 0) + 1);
  const first =
    windowMs === undefined
      ? launches.reduce<Date | null>((min, l) => (min === null || l.startedAt < min ? l.startedAt : min), null)
      : new Date(now.getTime() - windowMs);
  if (first === null) return [];
  const day = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days: Array<{ label: string; value: number }> = [];
  while (day <= today) {
    days.push({ label: `${day.getDate()}/${day.getMonth() + 1}`, value: counts.get(dayKey(day)) ?? 0 });
    day.setDate(day.getDate() + 1);
  }
  return days;
}
