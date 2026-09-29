# AC-64 — La API lista los Avisos de inyección, permite descartarlos y los añade a los Eventos

**Rebanada:** 13 · **Roadmap:** §1.13

- `GET /api/v1/injection-warnings?since=…` devuelve los avisos de los `tool.post` recibidos desde `since`, el más reciente primero y como máximo 500. Cada uno lleva el Evento, la Sesión, el Proyecto, el Subagente (si lo hay), la herramienta, la fuente, el patrón, su categoría y severidad, el fragmento, si está descartado y hasta 3 herramientas que el mismo agente invocó a continuación en su Turno (`followed_by`, con el resumen de una línea de cada una).
- Filtros: `project`, `session_id`, `severity` (repetible), `pattern` y `dismissed` (`false` por defecto: solo los vigentes; `true` solo los descartados; `all`). `facets` lista los Proyectos y patrones de todos los avisos del periodo, antes de filtrar. Sin `since` o con un parámetro inválido responde `400`.
- `PUT /api/v1/injection-warnings/{id}/dismissal` descarta un aviso como falso positivo (`204`), y `DELETE` lo vuelve a contar (`204`). El descarte se guarda en SQLite y sobrevive a los reinicios. Un `id` que no corresponde a ningún aviso responde `404`.
- Un aviso descartado no cuenta en las alertas del board (AC-68), pero sigue apareciendo con `dismissed: true` en el listado que lo pide.
- Los Eventos `tool.post` con aviso llevan `warnings` (`id`, `pattern`, `severity`, `dismissed`) en `GET /api/v1/events` y en el mensaje del WebSocket; el resto llevan una lista vacía.
- Las Sesiones llevan `injection_alerts`: los avisos de severidad alta sin descartar (AC-68).
- Los avisos nuevos se ven en cuanto llega el Evento, sin reescanear los anteriores.

**Verificación:** tests de integración (Vitest).
