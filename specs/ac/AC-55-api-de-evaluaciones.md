# AC-55 — La API guarda, borra y lista las Evaluaciones

**Rebanada:** 12 · **Roadmap:** §1.12

- `PUT /api/v1/evaluations/{object_type}/{object_id}` crea o sustituye la Evaluación del objeto con `{ score, tags, note }` y devuelve la guardada (`200`). Responde `400` si algún valor es inválido (AC-54) o la Evaluación queda vacía, y `404` si el objeto no existe: no hay Eventos de esa Sesión, no hay un `prompt.submitted` con ese id o no hay Eventos de ese Subagente.
- `DELETE` la borra (`204`); `404` si el objeto no tiene Evaluación.
- `GET /api/v1/evaluations` devuelve las Evaluaciones, la actualizada más recientemente primero y como máximo 500, con:
  - `summary`: el prompt del Turno o la Tarea del Subagente (`description`) en una línea de hasta 200 caracteres, `null` en una Sesión; y `agent_type` en un Subagente;
  - `tags`: las Etiquetas de las Evaluaciones devueltas con su recuento, ordenadas por uso;
  - `facets.projects`: los Proyectos con Evaluaciones, antes de filtrar.
- Filtros, combinables: `object_type` (repetible), `score` (`up`, `down` o `none`), `tag`, `project`, `since` (por `updated_at`) y `session_id` (la Sesión y sus Turnos y Subagentes). Un valor inválido responde `400`.
- `GET /api/v1/evaluations/tags` devuelve todas las Etiquetas usadas con su recuento, para el autocompletado.

**Verificación:** tests de integración (Vitest).
