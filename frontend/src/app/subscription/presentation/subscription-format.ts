// Textos y cuentas atrás de la ficha Uso de la suscripción (AC-137, AC-138).
import { formatDuration } from '../../shared/format';
import { UsageWindow, UsageWindowStatus } from '../models/subscription-usage';

/** El estado se dice siempre con texto, además del color (AC-137). */
export const STATUS_LABELS: Record<Exclude<UsageWindowStatus, 'reset_pending'>, string> = {
  comfortable: 'Holgado',
  near: 'Cerca',
  exhausted: 'Agotado',
};

export const RESET_PENDING_TEXT = 'Ventana reiniciada, pendiente de nueva lectura';

const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'short' });

/**
 * Una ventana cuyo reinicio ya pasó no se sigue enseñando como vigente aunque el servidor
 * aún no lo sepa: el reloj de la pantalla avanza más deprisa que las lecturas (AC-138).
 */
export function effectiveStatus(window: UsageWindow, now: Date): UsageWindowStatus {
  return window.status === 'reset_pending' || window.resetsAt.getTime() <= now.getTime() ? 'reset_pending' : window.status;
}

/** "1 h 12 min", "3 d 5 h"; por debajo del minuto no se cuentan segundos. */
export function countdown(ms: number): string {
  return ms < 60_000 ? 'menos de 1 min' : formatDuration(ms);
}

/** "se reinicia a las 18:40 · en 1 h 12 min"; si no es hoy, con el día: "se reinicia el vie 3 a las 18:40 · en 3 d 5 h". */
export function resetLabel(resetsAt: Date, now: Date): string {
  const sameDay = resetsAt.toDateString() === now.toDateString();
  const when = sameDay ? `a las ${time.format(resetsAt)}` : `el ${weekday.format(resetsAt)} ${resetsAt.getDate()} a las ${time.format(resetsAt)}`;
  return `se reinicia ${when} · en ${countdown(resetsAt.getTime() - now.getTime())}`;
}
