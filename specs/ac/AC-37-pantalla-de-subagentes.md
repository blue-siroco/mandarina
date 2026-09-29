# AC-37 — La pantalla de Subagentes lista los de todas las Sesiones

**Rebanada:** 7 · **Roadmap:** §1.7 · **Diseño:** spec/design.md §6.4d

En `/subagentes`:
- filtros de periodo (1 h, 24 h —por defecto—, 7 d o todo), Tipo de Subagente y Proyecto, y la casilla "Mostrar internos", reflejados en la URL (`?periodo=`, `?tipo=`, `?proyecto=`, `?internos=1`);
- una tabla con los Subagentes (la vista por Tipo está en `/agentes`, AC-48; el Tipo de cada fila enlaza a su perfil): inicio, Tipo, tarea, Proyecto, Sesión, estado con texto (En marcha / Terminado / Sin respuesta), duración, herramientas y tokens. Cada fila enlaza a `/sesiones/<id>?pestana=subagentes&subagente=<id>`.

La pantalla se actualiza sola cuando llega por el WebSocket un Evento de Subagente o de la herramienta `Agent`/`Task`. Sin Subagentes muestra un estado vacío que explica de dónde salen los datos, y un fallo de carga se avisa sin romper la pantalla. La barra lateral enlaza la pantalla en el grupo *Observar*.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
