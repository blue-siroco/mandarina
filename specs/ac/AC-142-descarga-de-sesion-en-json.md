# AC-142 — La Descarga de Sesión entrega la Sesión completa en JSON, solo con estructura

**Capa:** backend (caso de uso + HTTP) · **Rebanada:** 19 · **Roadmap:** §1.18 · **ADR:** 0013 · **Contrato:** `GET /api/v1/sessions/{id}/export` de `specs/api-spec.yaml`

- `GET /api/v1/sessions/{id}/export` responde `200` con `Content-Type: application/json` y `Content-Disposition: attachment; filename="mandarina-sesion-<id corto>.json"`. Una Sesión inexistente responde `404`.
- El JSON lleva: `export` (`DownloadHeader`: `kind: "session"`, `generated_at`, `include_content`, `total`, `exported`, `truncated`, `omitted`), `session` (el `SessionDetail`: metadatos, tokens, caché y Coste estimado, Turnos y Subagentes) y `events` (`DownloadedEvent`).
- **Sin `content=true`** (por defecto) los Eventos llevan `id`, `harness`, `project`, `directory`, `session_id`, `subagent_id`, `event_type`, `native_event_type`, `tool_name`, `occurred_at`, `received_at` y `block.rule`; y ni ellos ni la Sesión llevan `payload`, `block.reason`, `prompt` de los Turnos, `task` ni `result` de los Subagentes, ni `summary` de las herramientas, de los Bloqueos, de `current_tool` o de `waiting`, ni `description` de `live_subagents`: esos campos no aparecen (no van vacíos).
- Los Eventos van en orden cronológico ascendente.
- La petición es de solo lectura: no escribe en SQLite ni cambia el estado de la Exportación OTLP de ningún Turno (ADR-0013).

**Verificación:** `export-session.spec.ts` y test del endpoint en el backend.
