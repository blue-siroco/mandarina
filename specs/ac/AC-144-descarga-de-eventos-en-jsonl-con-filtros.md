# AC-144 — La Descarga de Eventos entrega en JSONL los Eventos que pasan los filtros

**Capa:** backend (caso de uso + HTTP) · **Rebanada:** 19 · **Roadmap:** §1.18 · **ADR:** 0013 · **Contrato:** `GET /api/v1/events/export` de `specs/api-spec.yaml`

- Acepta los mismos filtros que `GET /api/v1/events` (`project`, `session_id`, `event_type`, `since`) más `tool` y `content` (AC-143). Sin filtros descarga todos los Eventos, con el tope de AC-145.
- Responde `200` con `Content-Type: application/x-ndjson` y `Content-Disposition: attachment; filename="mandarina-eventos-<fecha>.jsonl"`.
- **Primera línea**: cabecera `{"export": {"kind": "events", "generated_at", "include_content", "filters", "total", "exported", "truncated", "omitted"}}`. Cada línea siguiente es un Evento, en orden cronológico ascendente, con las mismas reglas de contenido que AC-142.
- Va en **streaming**: no carga todos los Eventos en memoria; un test con muchos Eventos comprueba que la respuesta empieza antes de leerlos todos.
- Un filtro con un valor inválido responde `400`; sin coincidencias, `200` con solo la cabecera (`total: 0`).
- Es de solo lectura y no frena la ingesta (ADR-0004).

**Verificación:** `export-events.spec.ts` y test del endpoint en el backend.
