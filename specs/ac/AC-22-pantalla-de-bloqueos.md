# AC-22 — Los Bloqueos se ven en su pantalla, en la lista de Eventos y en el detalle de Sesión

**Rebanada:** 4 · **Roadmap:** §1.4 · **Diseño:** spec/design.md §3.3, §5.8, §5.9, §6.4

En `/bloqueos`, con los Bloqueos de los últimos 7 días:
- fichas: Bloqueos hoy, Bloqueos en 7 días, Regla de bloqueo más disparada y Sesiones afectadas;
- barras apiladas por día y Regla de bloqueo;
- una tabla con hora, Proyecto, Sesión (enlace al detalle), herramienta, entrada resumida en monoespaciada, Regla (badge) y motivo, con filtro por Regla reflejado en la URL.

En la lista de Eventos, un Bloqueo se ve con fondo de peligro y el motivo visible sin expandir. En el detalle de Sesión tiene su pestaña con contador y su carril en la línea de tiempo. En el board, la tarjeta cuenta los Bloqueos de la Sesión, y la ficha de herramientas del día (AC-13) muestra los Bloqueos de hoy.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
