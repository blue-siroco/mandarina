# AC-47 — La pantalla Agentes compara los Tipos de Subagente

**Rebanada:** 10 · **Roadmap:** §1.10 · **Diseño:** spec/design.md §6.4f

En `/agentes`:
- filtros de periodo (1 h, 24 h, 7 d —por defecto— o todo) y Proyecto, reflejados en la URL (`?periodo=`, `?proyecto=`);
- una tabla con una fila por Tipo de Subagente: Lanzamientos, en marcha, sin respuesta, duración mediana, coste medio por Lanzamiento, herramientas con error y Bloqueos por Lanzamiento, y última vez. Se ordena por Lanzamientos y se puede reordenar por cualquier columna (`aria-sort`);
- cada Tipo enlaza a su perfil `/agentes/<tipo>`; "Sin Tipo" enlaza a `/agentes/sin-tipo`.

En `/subagentes` ya no está la tabla por Tipo, y el Tipo de cada Subagente enlaza a su perfil.

La pantalla se actualiza sola cuando llega por el WebSocket un Evento de Subagente o de la herramienta `Agent`/`Task`. Sin Lanzamientos muestra un estado vacío que explica de dónde salen los datos, y un fallo de carga se avisa sin romper la pantalla. La barra lateral enlaza la pantalla en el grupo *Observar*.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
