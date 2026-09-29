# AC-29 — El servidor lee las Invocaciones de skill de los Eventos

**Rebanada:** 6 · **Roadmap:** §1.6 · **ADR:** 0007 (mismo patrón)

Las Invocaciones de skill se derivan al consultar, sin Tipo de evento nuevo ni cambios en el Adaptador:
- un `tool.pre` de la herramienta `Skill` es una invocación de `tool_input.skill` con argumentos `tool_input.args`. La hizo el **agente** si el Evento no tiene `subagent_id`, y un **Subagente** si lo tiene;
- un `prompt.submitted` cuyo prompt, sin espacios iniciales, empieza por `/nombre` (letras, dígitos, `-`, `_`, `:`; sin otra `/`) es una invocación de `nombre` por la **persona usuaria**, y el resto de la línea son sus argumentos. `/spec/roadmap`, `ver /commit` o `/` no cuentan;
- un bloque `tool_use` de `Skill` del Transcript del agente principal (invocada por el **agente**) o del Transcript de un Subagente (`agent-<id>.jsonl`, invocada por ese **Subagente**, con su Tipo del `.meta.json`), si su `id` no coincide con el `tool_use_id` de ningún Evento: cubre los Subagentes y los tramos en que el hook no estaba activo. Su `event_id` es `null`, y queda **fallida** si su `tool_result` trae `is_error: true`. No cuenta si en su Turno ya hay una `/nombre` de la persona usuaria con la misma skill.

Estado y duración:
- **fallida** si el `tool.post` con el mismo `tool_use_id` trae `payload.error` o `tool_response.success: false`, guardando la primera línea del error;
- si no, **en curso** hasta el primer `turn.ended` posterior de la Sesión (o el `subagent.stopped` de su Subagente) y **terminada** desde entonces, con la duración desde que se cargó;
- si la Sesión está Cerrada o Huérfana sin haber cerrado ese Turno, **terminada** sin duración.

Cada invocación lleva el número del Turno en que se cargó. Los argumentos se resumen en una línea con los secretos enmascarados. Un Evento mal formado nunca rompe la consulta.

**Verificación:** tests de dominio (Vitest) con Eventos reales de `Skill` y de `/nombre`, incluidos los falsos positivos.
