# AC-30 — La API devuelve las Invocaciones de skill y su uso agregado

**Rebanada:** 6 · **Roadmap:** §1.6

`GET /api/v1/skill-invocations?since=…` devuelve:
- `items`: las Invocaciones de skill (AC-29) cargadas desde `since`, la más reciente primero y como máximo 500. Cada una lleva id, Proyecto, Directorio, Sesión, Subagente y su tipo (o `null`), Turno, skill, argumentos, quién la invocó (`agent` / `subagent` / `user`), estado (`running` / `finished` / `failed`), inicio, fin, duración y error;
- `stats`: una fila por Proyecto y skill con el total, el reparto por quién la invocó y la última invocación, ordenada por total descendente. Cuenta todas las invocaciones filtradas, no solo las 500 de `items`;
- `facets.projects`: los Proyectos con alguna invocación desde `since`, antes de filtrar.

`project` y `session_id` filtran. Sin `since`, o con un `since` inválido, responde 400.

**Verificación:** tests de integración (Vitest).
