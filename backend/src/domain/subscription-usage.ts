// Uso de la suscripción de Claude (AC-129; roadmap §1.17, ADR-0012). Es un dato de
// la cuenta, no de la Sesión: se guarda la última lectura y el estado de cada
// ventana se calcula al consultar, porque una lectura vieja deja de ser vigente
// sin que llegue nada nuevo.

/** Ventana tal como la envía el Adaptador: `resets_at` en segundos desde epoch. */
export interface WindowReading {
  used_percentage: number;
  resets_at: number;
}

export interface SubscriptionReading {
  five_hour?: WindowReading;
  seven_day?: WindowReading;
}

export interface StoredWindow {
  used_percent: number;
  /** ISO-8601. */
  resets_at: string;
}

/** La última lectura guardada; una ventana que Claude Code no envió es `null`. */
export interface StoredUsage {
  five_hour: StoredWindow | null;
  seven_day: StoredWindow | null;
  updated_at: string;
}

export type WindowStatus = 'comfortable' | 'near' | 'exhausted' | 'reset_pending';

export interface UsageWindow extends StoredWindow {
  remaining_percent: number;
  status: WindowStatus;
}

export interface SubscriptionUsage {
  five_hour: UsageWindow | null;
  seven_day: UsageWindow | null;
  updated_at: string;
}

/** Con esto o menos por gastar la ventana está *Cerca* (inclusivo). */
export const NEAR_REMAINING_PERCENT = 20;

const WINDOWS = ['five_hour', 'seven_day'] as const;

// Un decimal basta para una ficha y evita arrastrar la coma flotante (0,1 + 0,2).
const round1 = (n: number) => Math.round(n * 10) / 10;
const clampPercent = (n: number) => Math.min(100, Math.max(0, n));

function present(window: StoredWindow | null, now: Date): UsageWindow | null {
  if (window === null) return null;
  const used = round1(clampPercent(window.used_percent));
  const remaining = round1(100 - used);
  // La lectura vieja no se enseña como vigente: gana sobre cualquier porcentaje.
  const status: WindowStatus =
    Date.parse(window.resets_at) <= now.getTime()
      ? 'reset_pending'
      : remaining === 0
        ? 'exhausted'
        : remaining <= NEAR_REMAINING_PERCENT
          ? 'near'
          : 'comfortable';
  return { used_percent: used, remaining_percent: remaining, resets_at: window.resets_at, status };
}

/** La vista pública de una lectura guardada, con el estado de cada ventana en `now`. */
export function presentUsage(stored: StoredUsage, now: Date): SubscriptionUsage {
  return { five_hour: present(stored.five_hour, now), seven_day: present(stored.seven_day, now), updated_at: stored.updated_at };
}

/**
 * La lectura guardada tras recibir `reading`. Claude Code puede omitir una ventana
 * en una respuesta y enviarla en la siguiente: la ausente conserva la anterior
 * mientras su reinicio siga en el futuro; pasado ese momento ya no describe la cuota.
 */
export function mergeReading(previous: StoredUsage | null, reading: SubscriptionReading, now: Date): StoredUsage {
  const merged: StoredUsage = { five_hour: null, seven_day: null, updated_at: now.toISOString() };
  for (const name of WINDOWS) {
    const incoming = reading[name];
    if (incoming) {
      merged[name] = { used_percent: incoming.used_percentage, resets_at: new Date(incoming.resets_at * 1000).toISOString() };
      continue;
    }
    const kept = previous?.[name];
    if (kept && Date.parse(kept.resets_at) > now.getTime()) merged[name] = kept;
  }
  return merged;
}
