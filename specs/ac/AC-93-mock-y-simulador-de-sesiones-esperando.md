# AC-93 — El mock-server y el simulador reproducen las Sesiones que esperan

**Capa:** mock · **Rebanada:** 16 · **Roadmap:** §1.16 · **Regla:** CLAUDE.md, «Si cambias el contrato, actualiza también el mock»

- `mock-server/lib/mock-api.mjs` (y `mock-sessions.mjs`) aplica la misma derivación que el backend: acepta los Tipos de evento nuevos, y `GET /sessions`, el detalle y `GET /metrics` devuelven `activity = "waiting"` y el campo de espera con los mismos datos que AC-92. Datos semilla con al menos una Sesión esperando por permiso, una por pregunta y una en un Subagente.
- El mock difunde por `/ws` los Eventos nuevos como `event.ingested`.
- El simulador (`send`) puede emitir: una petición de permiso, una pregunta abierta, una notificación de inactividad y el Evento que termina la espera; el README del mock lo documenta.
- El mock reutiliza la normalización del Adaptador (`Notification`, `PermissionRequest`) en lugar de duplicarla.

**Verificación:** `npm test` de `mock-server/` (node:test) con las respuestas validadas contra el esquema de `api-spec.yaml`.
