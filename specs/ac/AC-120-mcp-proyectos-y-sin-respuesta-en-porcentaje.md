# AC-120 — La pantalla MCP muestra los Proyectos de cada servidor y "sin respuesta" también como porcentaje

**Capa:** frontend · **Roadmap:** §1.9 · **Amplía:** AC-44

- Cada fila de Servidor MCP muestra en una columna **Proyectos** los Proyectos en los que se usó (dato `projects`, ya presente en AC-42), uno por etiqueta de texto; sin Proyectos, muestra `—`.
- La columna **Sin respuesta** muestra el conteo y, junto a él, el porcentaje sobre las llamadas (`sin respuesta / llamadas`), p. ej. `1 (25 %)`; con cero llamadas el porcentaje es `—`. Es texto, no depende del color.
- Las filas de herramienta desplegadas muestran también conteo y porcentaje, y dejan vacía la celda de Proyectos para conservar la alineación.

**Verificación:** tests unitarios (Vitest) de `McpPage` y E2E de `/mcp` con red interceptada.
