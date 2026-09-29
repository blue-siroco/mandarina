# AC-15 — La API lista las Sesiones del board con su resumen y filtros

**Rebanada:** 2 · **Roadmap:** §1.2 · **Diseño:** spec/design.md §6.1

`GET /api/v1/sessions` devuelve una entrada por Sesión, ordenadas por inicio (la más nueva primero); el orden no cambia con la actividad. Cada entrada incluye los Subagentes en marcha con su tipo, la descripción de su Tarea (del Transcript) y su herramienta en curso, además de: Proyecto, Directorio, Harness, Estado, Actividad, herramienta en curso con su entrada resumida (`Bash · npm test`), modelo más reciente del Transcript, Duración activa y de reloj, número de Eventos, herramientas, prompts, Turnos, Subagentes (y cuántos en marcha), Bloqueos, y los Eventos por intervalo de 5 min de la última hora.

Filtros: `since` (Sesiones con Eventos desde esa fecha), `state` (repetible), `directory` y `project`. La respuesta trae también `facets` con los Proyectos y Directorios disponibles antes de filtrar por Estado, Directorio o Proyecto.

**Verificación:** tests de integración (Vitest).
