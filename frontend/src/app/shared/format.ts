// Formatos de cifras y tiempos comunes a todas las pantallas (spec/design.md §2.4).

const integer = new Intl.NumberFormat('es-ES');
const compactFormat = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 });
const usdFormat = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' });
const percentFormat = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 });

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const formatInteger = (n: number) => integer.format(n);
export const formatCompact = (n: number) => compactFormat.format(n);
export const formatPercent = (ratio: number) => percentFormat.format(ratio);
/** El coste siempre es estimado (ADR-0005): la tilde lo recuerda. */
export const formatCost = (usd: number) => `~${usdFormat.format(usd)}`;

export function plural(n: number, one: string, many: string): string {
  return `${integer.format(n)} ${n === 1 ? one : many}`;
}

/** "35 s", "42 min", "1 h 10 min", "2 d 3 h". */
export function formatDuration(ms: number): string {
  if (ms < MINUTE) return `${Math.round(ms / SECOND)} s`;
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min`;
  if (ms < DAY) {
    const minutes = Math.floor((ms % HOUR) / MINUTE);
    return minutes > 0 ? `${Math.floor(ms / HOUR)} h ${minutes} min` : `${Math.floor(ms / HOUR)} h`;
  }
  const hours = Math.floor((ms % DAY) / HOUR);
  return hours > 0 ? `${Math.floor(ms / DAY)} d ${hours} h` : `${Math.floor(ms / DAY)} d`;
}

/** "hace 12 s", "hace 9 min"… sin decimales: es orientativo. */
export function relativeTime(date: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - date.getTime());
  if (ms < MINUTE) return `hace ${Math.floor(ms / SECOND)} s`;
  if (ms < HOUR) return `hace ${Math.floor(ms / MINUTE)} min`;
  if (ms < DAY) return `hace ${Math.floor(ms / HOUR)} h`;
  return `hace ${Math.floor(ms / DAY)} d`;
}

export const shortId = (id: string) => id.slice(0, 8);

/** `…/Codev/mandarina`: el final de una ruta es lo que la distingue. */
export function tailPath(path: string, segments = 2): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length <= segments ? path : `…/${parts.slice(-segments).join('/')}`;
}
