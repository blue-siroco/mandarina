# AC-41 — El servidor lee las invocaciones de Herramientas MCP de los Eventos

**Rebanada:** 9 · **Roadmap:** §1.9 · **ADR:** 0007 (mismo patrón)

Sin Tipo de evento nuevo ni cambios en el Adaptador:
- es una invocación de Herramienta MCP cada `tool.pre` o `tool.blocked` cuyo `tool_name` empieza por `mcp__`, y cada `ListMcpResourcesTool` / `ReadMcpResourceTool`;
- el servidor y el ámbito salen de `mcp_server.name` y `mcp_server.source`. Si faltan, el servidor es lo que va entre `mcp__` y el último `__` (`mcp__claude_ai_Claude_Docs__batch` → `claude_ai_Claude_Docs`) y el ámbito es `null`. En las de recursos, el servidor es `tool_input.server`;
- el `tool.post` se enlaza por `tool_use_id`. Estado:
  - `ok` si hay `PostToolUse`;
  - `error` si hay `PostToolUseFailure`, con la primera línea de `error`;
  - `interrupted` si ese `PostToolUseFailure` trae `is_interrupt: true`;
  - `blocked` si es un `tool.blocked`;
  - sin `tool.post`: `no_response` si ya terminó su Turno (o su Subagente) o la Sesión está Cerrada o Huérfana, y `running` si no;
- latencia: `duration_ms` del `tool.post`; si falta, la diferencia de `occurred_at` entre `tool.post` y `tool.pre`;
- tamaño: bytes del JSON de `tool_response`. `has_image` si trae algún bloque `type: image`;
- la entrada se resume en una línea con el primer campo de texto de `tool_input`, con los secretos enmascarados;
- herramientas diferidas sin usar: las de `tool_response.matches` de un `ToolSearch` que empiezan por `mcp__` y no tienen ningún `tool.pre` en esa Sesión.

Un Evento mal formado nunca rompe la lectura.

**Verificación:** tests de dominio (Vitest) con Eventos reales de Claude Code (Playwright MCP, con imagen, fallo, interrupción y sin respuesta).
