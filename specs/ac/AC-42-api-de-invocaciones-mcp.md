# AC-42 — La API devuelve las invocaciones MCP y su uso por servidor y herramienta

**Rebanada:** 9 · **Roadmap:** §1.9

`GET /api/v1/mcp-invocations?since=…` devuelve:
- `items`: las invocaciones (AC-41) empezadas desde `since`, la más reciente primero, como máximo 500;
- `servers`: una fila por Servidor MCP (por nombre, con sus ámbitos), ordenadas por llamadas, y dentro de cada una sus herramientas. Cada fila lleva llamadas y su reparto por estado, el % de fallos (`errors / (ok + errors)`, sin contar las interrumpidas ni las bloqueadas), la latencia mediana y el p95, el tamaño medio y máximo de respuesta, si alguna trae imagen, la última llamada y el número de Sesiones. Cuenta todas las invocaciones filtradas, no solo las 500 de `items`;
- `unused_deferred`: las Herramientas MCP cargadas y sin usar de cada Sesión;
- `facets`: los Proyectos y los servidores del periodo, antes de filtrar.

`project`, `server` y `session_id` filtran. Sin `since`, o con un parámetro inválido, responde 400.

**Verificación:** tests de integración (Vitest).
