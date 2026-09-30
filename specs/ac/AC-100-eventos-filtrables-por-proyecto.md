# AC-100 — La lista de Eventos se filtra por Proyecto

**Rebanada:** 1 · **Roadmap:** §1.2

`GET /api/v1/events` acepta además `project` (no vacío): solo devuelve los Eventos de ese Proyecto. Se combina con `session_id`, `event_type`, `since` y `before`; el `limit` se aplica después de filtrar, así que un Proyecto poco activo no queda tapado por los Eventos de otros. Un `project` vacío responde 400. El mock (`mock-server/`) filtra igual.

**Verificación:** test de integración (Vitest) y test del mock.
