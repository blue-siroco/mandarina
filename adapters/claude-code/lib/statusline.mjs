// Lectura de la cuota de la suscripción a partir del JSON que Claude Code pasa
// al comando de `statusLine` (ADR-0012). El esquema de `rate_limits` es el de la
// documentación de Claude Code (supuesto A, sin verificar con un payload real).

const WINDOWS = ['five_hour', 'seven_day'];

function toWindow(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  const { used_percentage: used, resets_at: resets } = raw;
  if (typeof used !== 'number' || !Number.isFinite(used)) return null;
  if (typeof resets !== 'number' || !Number.isFinite(resets) || resets <= 0) return null;
  // Se acota en origen: un 100,4 % por redondeo de Claude Code no debe costar un 400 y perder la lectura.
  return { used_percentage: Math.min(100, Math.max(0, used)), resets_at: Math.round(resets) };
}

/**
 * Cuerpo de `PUT /api/v1/subscription-usage`, o `null` si no hay ninguna ventana
 * válida. Cada ventana se valida por separado porque Claude Code puede omitirlas
 * de forma independiente.
 */
export function readingFromStatusLine(native) {
  const limits = native?.rate_limits;
  if (limits === null || typeof limits !== 'object') return null;
  const reading = {};
  for (const name of WINDOWS) {
    const window = toWindow(limits[name]);
    if (window) reading[name] = window;
  }
  if (Object.keys(reading).length === 0) return null;
  // Informativo: el dato es de la cuenta, no de la Sesión.
  if (typeof native.session_id === 'string' && native.session_id !== '') reading.session_id = native.session_id;
  return reading;
}
