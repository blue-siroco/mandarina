# AC-08 — Consulta de Eventos recientes paginada

**Rebanada:** 1

`GET /api/v1/events?limit=N` devuelve como mucho N Eventos (por defecto 100, máximo 500), del más reciente al más antiguo según `received_at`.
`before=<id>` devuelve los anteriores a ese Evento, para paginar hacia atrás.

**Verificación:** tests de integración del backend.
