# AC-32 — La pantalla de Skills muestra qué skills se usan en cada Proyecto

**Rebanada:** 6 · **Roadmap:** §1.6 · **Diseño:** spec/design.md §6.4c

En `/skills`:
- un selector de periodo (1 h, 24 h, 7 d —por defecto— o todo) y un filtro por Proyecto, reflejados en la URL (`?periodo=`, `?proyecto=`);
- una tabla con una fila por Proyecto y skill: invocaciones totales, reparto agente · persona usuaria · Subagente y última invocación, ordenada por total;
- al desplegar una fila, sus invocaciones con hora, Sesión (enlace a `/sesiones/<id>?pestana=skills`), quién la invocó, estado y argumentos.

Solo aparecen las skills usadas. La pantalla se actualiza sola cuando llega por el WebSocket un Evento de `Skill` o un `prompt.submitted`. Sin invocaciones muestra un estado vacío que explica de dónde salen los datos, y un fallo de carga se avisa sin romper la pantalla. La barra lateral enlaza la pantalla en el grupo *Observar*.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
