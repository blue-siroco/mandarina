// Estado de la Exportación OTLP simulado (AC-52): el mock no envía nada a ningún
// colector, pero enseña un exportador activo para poder probar el indicador y su
// modal. Los Turnos salen de los Eventos; algunos fallan, siempre los mismos.

const SETTLE_MS = 5000;
const RECENT = 50;
const HOST = 'collector.local:4318';

/** Un Turno de cada 7 falla y uno de cada 11 sigue pendiente de reintento. */
function stateOf(index) {
  if (index % 7 === 6) return 'failed';
  if (index % 11 === 10) return 'pending';
  return 'exported';
}

export function exporterStatus(events, now = new Date()) {
  const opened = new Map();
  const turns = [];
  for (const e of events) {
    if (e.subagent_id !== null) continue;
    if (e.event_type === 'prompt.submitted') opened.set(e.session_id, e.id);
    else if (e.event_type === 'turn.ended' && opened.has(e.session_id)) {
      turns.push({ turn_id: opened.get(e.session_id), session_id: e.session_id, project: e.project, ended_at: e.occurred_at });
      opened.delete(e.session_id);
    }
  }
  const done = turns.filter((t) => now.getTime() - Date.parse(t.ended_at) >= SETTLE_MS);
  const items = done.map((t, i) => {
    const state = stateOf(i);
    return {
      turn_id: t.turn_id,
      session_id: t.session_id,
      project: t.project,
      state,
      attempts: state === 'exported' ? 1 : state === 'pending' ? 2 : 4,
      last_error: state === 'exported' ? null : state === 'pending' ? 'HTTP 503' : 'connect ECONNREFUSED',
      updated_at: new Date(Date.parse(t.ended_at) + SETTLE_MS).toISOString(),
    };
  });
  const counts = { pending: 0, exported: 0, failed: 0 };
  for (const item of items) counts[item.state] += 1;
  const exported = items.filter((i) => i.state === 'exported');
  return {
    enabled: true,
    endpoint_host: HOST,
    include_content: false,
    enabled_since: events[0]?.occurred_at ?? now.toISOString(),
    counts,
    last_exported_at: exported.length ? exported.map((i) => i.updated_at).sort().at(-1) : null,
    recent: [...items].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, RECENT),
  };
}
