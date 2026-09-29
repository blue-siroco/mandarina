# AC-23 — La API describe la Tarea y la actividad de cada Subagente

**Rebanada:** 3b · **Roadmap:** §1.3 · **Diseño:** spec/design.md §6.3 · **ADR:** 0003

En `GET /api/v1/sessions/{id}`, cada Subagente incluye además:
- `task`: la Tarea del Subagente, con la descripción (de `agent-<id>.meta.json`) y el prompt completo (primer mensaje de `agent-<id>.jsonl`), o `null` sin Transcript;
- `tools`: las herramientas que invocó, en orden, con nombre, entrada resumida, hora y resultado (`ok`, `error`, `blocked` o `running`). Salen de los Eventos del Subagente cuando los hay y, si no, de su Transcript;
- `result`: la respuesta final que devolvió (último texto del Transcript o, si no hay, el `last_assistant_message` del `SubagentStop`), o `null` mientras sigue en marcha.

Una línea del Transcript ilegible no rompe la respuesta. El Transcript se lee bajo demanda y no se copia (ADR-0003).

**Verificación:** tests de dominio e integración (Vitest).
