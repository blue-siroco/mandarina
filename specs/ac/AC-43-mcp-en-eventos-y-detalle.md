# AC-43 — Los Eventos y el detalle de Sesión muestran las Herramientas MCP

**Rebanada:** 9 · **Roadmap:** §1.9 · **Diseño:** spec/design.md §6.2, §6.3

- Una Herramienta MCP se nombra como `servidor · herramienta` (`playwright · browser_navigate`), seguido de la entrada resumida, en la lista de Eventos, en la herramienta en curso de la tarjeta del board y en las herramientas de los Subagentes.
- `/eventos` tiene la categoría **MCP**, reflejada en la URL, que deja solo los Eventos de Herramientas MCP.
- En `/sesiones/:id`, la pestaña *MCP* (`?pestana=mcp`, con contador):
  - un resumen por servidor con llamadas, fallos y latencia mediana;
  - las invocaciones con hora, servidor, herramienta, entrada, quién la invocó, estado con texto (Bien, Error, Interrumpida, Bloqueada, En curso o Sin respuesta), latencia y tamaño, con un icono si la respuesta incluye imagen;
  - las herramientas "Cargadas y sin usar".
- Sin invocaciones, la pestaña explica de dónde salen. Se refresca en vivo como el resto del detalle.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
