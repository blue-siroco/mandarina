# AC-17 — La lista de Eventos se filtra y cada Evento se expande

**Rebanada:** 2 · **Roadmap:** §1.2 · **Diseño:** spec/design.md §5.5, §5.8, §5.13, §6.2

`GET /api/v1/events` acepta además `session_id`, `event_type` (repetible) y `since`.
En `/eventos`:
- filtro por categoría (Todos · Prompts · Herramientas · Subagentes · Sesión · Turnos · Bloqueos) y por herramienta, reflejados en la URL, con un contador "filtrados / cargados";
- cada fila muestra un resumen de una línea (herramienta + entrada resumida, o el principio del prompt);
- al expandir una fila se ven el Tipo nativo, el Directorio y la ruta del Transcript, además del payload en monoespaciada. Los valores enmascarados por el servidor (`***`) se muestran como `‹secreto›`, con su propio estilo y sin forma de revelarlos.

Se mantiene todo lo de AC-09 (en vivo, sin duplicados, estado vacío, pantallas estrechas).

**Verificación:** tests de integración, componente y caso de uso (Vitest); E2E Playwright con red interceptada.
