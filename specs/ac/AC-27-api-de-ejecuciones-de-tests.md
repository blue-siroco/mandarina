# AC-27 — La API devuelve las Ejecuciones de tests

**Rebanada:** 5 · **Roadmap:** §1.5 · **ADR:** 0007

`GET /api/v1/test-runs?since=…` devuelve las Ejecuciones de tests (AC-26) recibidas desde `since`, la más reciente primero y como máximo 500. Cada una lleva: id, Proyecto, Directorio, Sesión, Subagente (o `null`), Tipo de tests (`unit` / `e2e`), runner, comando resumido, resultado, contadores, duración (o `null`), hora de fin y tests fallidos.

- `project` y `kind` filtran por Proyecto y Tipo de tests.
- `facets.projects` lista los Proyectos con alguna Ejecución desde `since`, antes de filtrar.
- Sin `since`, o con un `since` o `kind` inválidos, responde 400.

**Verificación:** tests de integración (Vitest).
