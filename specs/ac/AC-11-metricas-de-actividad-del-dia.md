# AC-11 — La API resume la actividad del día a partir de los Eventos

**Rebanada:** 1b · **Roadmap:** §1.2 · **Diseño:** spec/design.md §5.3

`GET /api/v1/metrics?since=<fecha ISO>` cuenta, entre las Sesiones con algún Evento recibido desde `since`:
- cuántas están **Trabajando** (su último Evento no es `turn.ended` ni `session.started`) y cuántas **En pausa** (su último Evento es `turn.ended` o `session.started`), ambas sin `session.ended` y con actividad en los últimos 30 min;
- cuántas están **Huérfanas** (sin `session.ended` ni Eventos en más de 30 min) y cuántas **Cerradas**;
- cuántos **Subagentes en marcha** hay (`subagent.started` sin su `subagent.stopped`) en Sesiones Trabajando o En pausa;
- cuántos Eventos, invocaciones de herramienta (`tool.pre`) y prompts se recibieron desde `since`.

Sin `since`, o con un `since` que no es fecha, responde 400.

**Verificación:** tests de dominio e integración (Vitest).
