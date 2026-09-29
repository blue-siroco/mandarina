# AC-34 — Eventos, board, métricas y detalle usan el ciclo de vida del Subagente

**Rebanada:** 7 · **Roadmap:** §1.7

- Cada Evento `subagent.started` y `subagent.stopped` lleva `subagent: { type, description, duration_ms, internal }` (AC-33), en `GET /api/v1/events` y en el mensaje del WebSocket. `duration_ms` solo en `subagent.stopped`. Los demás Eventos llevan `subagent: null`.
- En el board (`GET /api/v1/sessions`), `subagent_count` no cuenta los internos, y `running_subagents` y `live_subagents` incluyen los lanzamientos pendientes con su Tipo y su descripción. En las métricas, `subagents_running` hace lo mismo.
- En el detalle (`GET /api/v1/sessions/{id}`), cada Subagente lleva `tool_use_id` e `internal`, los pendientes aparecen con `subagent_id: null`, y la Tarea sale del lanzamiento cuando falta el Transcript.

**Verificación:** tests de integración (Vitest).
