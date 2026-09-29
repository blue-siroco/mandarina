# AC-28 — La pantalla de tests muestra el Estado de los tests de cada Proyecto

**Rebanada:** 5 · **Roadmap:** §1.5 · **Diseño:** spec/design.md §6.4b

En `/tests`, con las Ejecuciones de tests de los últimos 7 días:
- una tarjeta por Proyecto con dos bloques, **Unitarios** y **E2E**. Cada bloque muestra el resultado de la última Ejecución de ese Tipo de tests con texto (Pasan, Fallan o Sin datos) y no solo con color, además de pasados, fallidos, omitidos y total, la duración, cuándo terminó, el runner, el comando y un enlace a la Sesión que la lanzó (y al Subagente, si lo hubo);
- si la última Ejecución falló, la lista de tests fallidos con nombre, fichero, error y el `AC-*` como badge;
- una tabla con el historial de Ejecuciones (hora, Proyecto, Tipo de tests, runner, resultado, pasados/total, duración y Sesión);
- un filtro por Proyecto reflejado en la URL (`?proyecto=`).

La pantalla se actualiza sola cuando llega por el WebSocket un `tool.post` de `Bash`. Sin Ejecuciones muestra un estado vacío que explica de dónde salen los datos, y un fallo de carga se avisa sin romper la pantalla. La barra lateral enlaza la pantalla.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
