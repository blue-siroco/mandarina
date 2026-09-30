# AC-86 — Los hooks nuevos se documentan y sus Eventos se enmascaran en origen

**Capa:** adapter · **Rebanada:** 16 · **Roadmap:** §1.16 · **ADR:** 0009

- El README del Adaptador añade `Notification` y `PermissionRequest` al bloque de instalación de `settings.json` (con `matcher: "*"` en `PermissionRequest`) y explica en una línea qué aporta cada uno (Sesiones que esperan). El aviso de que solo se escribe en stdout al bloquear sigue siendo cierto.
- Antes de enviar, el Adaptador enmascara secretos y PII de estos Eventos con el mismo enmascarado que el resto (AC-60, AC-61, AC-62): el `message` de `Notification` y el `tool_input` de `PermissionRequest` (un comando con `API_KEY=…`, un email en la pregunta) llegan con Marcadores de tipo, y `tool_name` y la estructura del payload se conservan.
- Un fixture con un secreto en `tool_input.command` y otro en `message` demuestra que ninguno sale en claro.

**Verificación:** tests del Adaptador (`mask.test.mjs`, `normalize.test.mjs`) con fixtures; revisión del README.
