# AC-113 — Los `tool.post` resumen la salida de la herramienta en una línea

**Capa:** frontend · **Rebanada:** 2 · **Roadmap:** §1.3

En las filas de Evento (lista de Eventos y línea de tiempo del detalle de Sesión), un `tool.post` muestra tras el resumen de la entrada un resumen de una línea de `tool_response` (ya enmascarada por el servidor), precedido de `→`:
- `Bash`: primera línea no vacía de `stdout`, o `exit N` si no hay salida y el código no es 0 (`exit 0` si no hay salida y termina bien).
- `Read`: número de líneas leídas ("N líneas").
- Con `error` (`tool.post` de fallo o `tool_response.error`): el `error` recortado a una línea.
- Otras herramientas: el texto de la respuesta si es una cadena; si no, nada. Nunca se pinta como HTML.
- Los resúmenes de la entrada, de MCP y de Skill no cambian; sin `tool_response` interpretable no se añade nada.

**Verificación:** tests de la función de resumen y de componente (Vitest); E2E en AC-115.
