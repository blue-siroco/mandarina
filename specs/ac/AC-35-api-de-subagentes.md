# AC-35 — La API devuelve los Subagentes de todas las Sesiones

**Rebanada:** 7 · **Roadmap:** §1.7

`GET /api/v1/subagents?since=…` devuelve los Subagentes (AC-33) de las Sesiones con actividad desde `since` que empezaron desde entonces o siguen en marcha:
- `items`: el más reciente primero, como máximo 500. Cada uno lleva Sesión, Proyecto, Directorio, `subagent_id` (o `null` si está pendiente), `tool_use_id`, Tipo, descripción de la Tarea, `internal`, estado (`running` / `finished` / `no_response`, AC-45), inicio, fin, duración (hasta ahora si sigue en marcha), herramientas, modelo, tokens y Coste estimado (los tres `null` sin Transcript);
- `facets`: los Proyectos y los Tipos del periodo, antes de filtrar.

`project` y `type` filtran. Los internos se omiten salvo con `include_internal=true`. Sin `since`, o con un parámetro inválido, responde 400.

**Verificación:** tests de integración (Vitest).
