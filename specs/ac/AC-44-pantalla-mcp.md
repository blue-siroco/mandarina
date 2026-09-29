# AC-44 — La pantalla MCP muestra el uso, los fallos y la latencia de cada Servidor MCP

**Rebanada:** 9 · **Roadmap:** §1.9 · **Diseño:** spec/design.md §6.4e

En `/mcp`:
- filtros de periodo (1 h, 24 h, 7 d —por defecto— o todo), Proyecto y servidor, reflejados en la URL (`?periodo=`, `?proyecto=`, `?servidor=`);
- una fila por Servidor MCP con sus ámbitos, herramientas usadas, llamadas, % de fallos, sin respuesta, latencia mediana / p95, respuesta media / máxima (con aviso si incluye imagen), última llamada y Sesiones, ordenada por llamadas;
- al desplegar un servidor, sus herramientas con las mismas cifras. Cada herramienta enlaza a `/eventos?herramienta=<tool_name>`.

La pantalla se actualiza sola cuando llega por el WebSocket un Evento de una Herramienta MCP. Sin invocaciones muestra un estado vacío que explica de dónde salen los datos, y un fallo de carga se avisa sin romper la pantalla. La barra lateral enlaza la pantalla en el grupo *Observar*.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
