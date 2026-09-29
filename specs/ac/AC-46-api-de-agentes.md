# AC-46 — La API compara los Tipos de Subagente y da el perfil de cada uno

**Rebanada:** 10 · **Roadmap:** §1.10

- `GET /api/v1/agents?since=…` devuelve una fila por Tipo de Subagente (y "Sin Tipo") con Lanzamientos empezados desde `since` o en marcha, ordenadas por Lanzamientos. Cada fila lleva:
  - Lanzamientos, en marcha, sin respuesta, primer y segundo plano;
  - duración mediana y p95 de los terminados;
  - tokens, Coste estimado total y por Lanzamiento;
  - herramientas con error y Bloqueos por Lanzamiento;
  - Sesiones, Proyectos y el último Lanzamiento.

  Los Subagentes internos no cuentan. `facets.projects` lista los Proyectos antes de filtrar.
- `GET /api/v1/agents/{type}?since=…` devuelve:
  - la misma fila (`summary`);
  - quién lo lanza, los modelos, las herramientas, las skills, los Servidores MCP y las Ejecuciones de tests (pasan / fallan);
  - sus Lanzamientos, el más reciente primero y como máximo 500.

  `sin-tipo` pide los Lanzamientos sin Tipo conocido. Un Tipo sin Lanzamientos en el periodo devuelve cifras a cero, no 404.
- `project` filtra las dos. Sin `since`, o con un parámetro inválido, responden 400.
- `GET /api/v1/subagents` ya no devuelve `stats`.

**Verificación:** tests de integración (Vitest).
