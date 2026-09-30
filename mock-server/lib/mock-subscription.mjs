// Imitación de `GET`/`PUT /api/v1/subscription-usage` (AC-132; ADR-0012). Aplica las
// mismas reglas que el dominio del backend (`domain/subscription-usage.ts`): un
// decimal, estado calculado al consultar y ventanas independientes.

const WINDOWS = ['five_hour', 'seven_day'];
const NEAR_REMAINING_PERCENT = 20;
const round1 = (n) => Math.round(n * 10) / 10;

const isWindow = (w) =>
  w !== null &&
  typeof w === 'object' &&
  Object.keys(w).every((k) => k === 'used_percentage' || k === 'resets_at') &&
  typeof w.used_percentage === 'number' &&
  w.used_percentage >= 0 &&
  w.used_percentage <= 100 &&
  Number.isInteger(w.resets_at);

/** Mensaje de error si el cuerpo incumple el contrato de `SubscriptionUsageInput`, o `null`. */
function validationError(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return 'El cuerpo debe ser un objeto';
  const unknown = Object.keys(body).find((k) => k !== 'session_id' && !WINDOWS.includes(k));
  if (unknown) return `Campo desconocido: ${unknown}`;
  if ('session_id' in body && (typeof body.session_id !== 'string' || body.session_id === '')) return 'session_id no puede estar vacío';
  for (const name of WINDOWS) if (name in body && !isWindow(body[name])) return `${name} inválida`;
  if (!WINDOWS.some((name) => name in body)) return 'Falta al menos una ventana: five_hour o seven_day';
  return null;
}

function present(window, nowMs) {
  if (!window) return null;
  const used = round1(window.used_percent);
  const remaining = round1(100 - used);
  const status =
    Date.parse(window.resets_at) <= nowMs ? 'reset_pending' : remaining === 0 ? 'exhausted' : remaining <= NEAR_REMAINING_PERCENT ? 'near' : 'comfortable';
  return { used_percent: used, remaining_percent: remaining, resets_at: window.resets_at, status };
}

/** Una cuenta de suscripción con la ventana de 5 h cerca del límite y la semanal holgada. */
export function seedReading(now = new Date()) {
  const inSeconds = (s) => Math.floor(now.getTime() / 1000) + s;
  return {
    five_hour: { used_percentage: 85, resets_at: inSeconds(72 * 60) },
    seven_day: { used_percentage: 35, resets_at: inSeconds(3 * 24 * 3600) },
  };
}

/**
 * La última lectura de la cuenta, en memoria.
 * @param {{ now?: () => Date }} [options]
 */
export function createSubscriptionBook({ now = () => new Date() } = {}) {
  let stored = null;
  return {
    /** `{ ok: true }` o `{ ok: false, message }` (400). */
    put(body) {
      const message = validationError(body);
      if (message) return { ok: false, message };
      const at = now();
      const next = { five_hour: null, seven_day: null, updated_at: at.toISOString() };
      for (const name of WINDOWS) {
        if (body[name]) {
          next[name] = { used_percent: body[name].used_percentage, resets_at: new Date(body[name].resets_at * 1000).toISOString() };
        } else if (stored?.[name] && Date.parse(stored[name].resets_at) > at.getTime()) {
          next[name] = stored[name];
        }
      }
      stored = next;
      return { ok: true };
    },
    /** `null` si nunca llegó una lectura (cuenta sin suscripción). */
    current() {
      if (!stored) return null;
      const nowMs = now().getTime();
      return { five_hour: present(stored.five_hour, nowMs), seven_day: present(stored.seven_day, nowMs), updated_at: stored.updated_at };
    },
  };
}
