// Envía Sesiones simuladas a un backend real, como lo haría el Adaptador.
// Sirve para probar la ingesta, la persistencia, el enmascarado y el
// WebSocket del backend (y el frontend conectado a él) sin Claude Code.
import { createSimulation } from './scenario.mjs';

/**
 * @param {object} options
 * @param {string} options.target URL base del backend (p. ej. http://127.0.0.1:4000).
 * @param {number} [options.count] Eventos a enviar; 0 = sin fin.
 * @param {number} [options.intervalMs] Pausa entre Eventos.
 * @param {number} [options.seed]
 * @param {(line: string) => void} [options.log]
 */
export async function sendSimulatedEvents({ target, count = 0, intervalMs = 1000, seed = Date.now(), log = () => {} }) {
  // Con secretos: así se ve el enmascarado del backend en acción.
  const simulation = createSimulation({ seed, includeSecrets: true, waits: true });
  const url = `${target.replace(/\/+$/, '')}/api/v1/events`;
  const stats = { sent: 0, accepted: 0, rejected: 0, failed: 0 };

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
    if (intervalMs > 0 && (count === 0 || stats.sent < count)) await new Promise((r) => setTimeout(r, intervalMs));
  }
  return stats;
}
