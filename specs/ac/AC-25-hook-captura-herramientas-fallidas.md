# AC-25 — El hook captura las herramientas que fallan

**Rebanada:** 5 · **Roadmap:** §1.5 · **ADR:** 0002, 0007

El Adaptador traduce el hook `PostToolUseFailure` a un Evento `tool.post` con `native_event_type: PostToolUseFailure`, `tool_name` y el payload nativo (con `error` y `tool_input`). Como el resto de hooks, no escribe en stdout y sale con código 0. La instalación documentada registra también `PostToolUseFailure`.

En la actividad de un Subagente (AC-23), una herramienta cuyo `tool.post` trae `payload.error` se muestra con el resultado `error`.

**Verificación:** tests del Adaptador (`node:test`) con un fixture de `PostToolUseFailure`; test de dominio (Vitest) de la actividad del Subagente.
