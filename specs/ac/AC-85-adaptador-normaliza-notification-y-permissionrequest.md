# AC-85 — El Adaptador normaliza `Notification` y `PermissionRequest`

**Capa:** adapter · **Rebanada:** 16 · **Roadmap:** §1.16 · **ADR:** nuevo, amplía 0002

- `PermissionRequest` se envía como Evento de un Tipo de evento nuevo (nombre a fijar en el ADR, p. ej. `permission.requested`) con `tool_name` y el `payload` nativo completo (incluye `tool_input`). `Notification` se envía como otro Tipo nuevo (p. ej. `session.notified`) con el `payload` nativo completo (`message` y, si viene, `notification_type`). Ambos conservan `native_event_type` (`PermissionRequest`, `Notification`), `session_id`, `subagent_id` (si el hook trae `agent_id`), `project`, `directory`, `occurred_at` y `transcript_path`, igual que el resto (AC-01).
- `schema_version` sigue en 1 (cambio aditivo, como ADR-0006).
- Un `Notification` sin `session_id` no produce Evento. El test de `normalize.test.mjs` que hoy exige `null` para `Notification` (AC-01) se sustituye por estos casos; cualquier otro hook no capturado sigue devolviendo `null`.
- Para estos dos hooks el Adaptador nunca escribe en stdout ni cambia el resultado del hook: no aprueba, no deniega ni retrasa el diálogo de permiso de Claude Code (ADR-0004). Sale con código 0 aunque Mandarina no responda (AC-02).
- Las Reglas de bloqueo y la consulta de Presupuestos (ADR-0010) no se evalúan para estos hooks.

**Verificación:** tests del Adaptador (`node:test`) con fixtures `Notification-permission.json`, `Notification-idle.json` y `PermissionRequest.json`; comprobación de stdout vacío y de salida 0 sin backend.
