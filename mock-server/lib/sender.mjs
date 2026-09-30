// Envía Sesiones simuladas a un backend real, como lo haría el Adaptador.
// Sirve para probar la ingesta, la persistencia, el enmascarado y el
// WebSocket del backend (y el frontend conectado a él) sin Claude Code.
import { createSimulation } from './scenario.mjs';

const USAGE_EVERY = 5;

/** Cuenta de suscripción con la ventana de 5 h cerca del límite, que se va gastando con los Eventos. */
function usageReading(sent) {
  const inSeconds = (s) => Math.floor(Date.now() / 1000) + s;
  return {
    five_hour: { used_percentage: Math.min(99, 85 + Math.floor(sent / USAGE_EVERY)), resets_at: inSeconds(72 * 60) },
    seven_day: { used_percentage: 35, resets_at: inSeconds(3 * 24 * 3600) },
  };
}

/**
 * @param {object} options
 * @param {string} options.target URL base del backend (p. ej. http://127.0.0.1:4000).
 * @param {number} [options.count] Eventos a enviar; 0 = sin fin.
 * @param {number} [options.intervalMs] Pausa entre Eventos.
 * @param {number} [options.seed]
 * @param {boolean} [options.subscription] Envía también lecturas del uso de la suscripción (AC-132).
 * @param {(line: string) => void} [options.log]
 */
export async function sendSimulatedEvents({ target, count = 0, intervalMs = 1000, seed = Date.now(), subscription = false, log = () => {} }) {
  // Con secretos: así se ve el enmascarado del backend en acción.
  const simulation = createSimulation({ seed, includeSecrets: true, waits: true });
  const base = target.replace(/\/+$/, '');
  const url = `${base}/api/v1/events`;
  const stats = { sent: 0, accepted: 0, rejected: 0, failed: 0 };

  // Como haría el Adaptador desde la statusLine: una lectura al empezar y otra cada pocos Eventos.
  const sendUsage = async () => {
    const response = await fetch(`${base}/api/v1/subscription-usage`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(usageReading(stats.sent)),
      signal: AbortSignal.timeout(3000),
    });
    log(`${response.status} suscripción`);
  };
  const trySendUsage = () => sendUsage().catch((error) => log(`ERROR suscripción ${error.message}`));
  if (subscription) await trySendUsage();

  while (count === 0 || stats.sent < count) {
    const event = simulation.next();
    stats.sent++;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(3000),
      });
      if (response.status === 202) stats.accepted++;
      else stats.rejected++;
      log(`${response.status} ${event.project} ${event.session_id.slice(0, 8)} ${event.event_type}${event.tool_name ? ` ${event.tool_name}` : ''}`);
    } catch (error) {
      stats.failed++;
      log(`ERROR ${error.message}`);
    }
    if (subscription && stats.sent % USAGE_EVERY === 0) await trySendUsage();
    if (intervalMs > 0 && (count === 0 || stats.sent < count)) await new Promise((r) => setTimeout(r, intervalMs));
  }
  return stats;
}
