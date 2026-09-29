# AC-16 — El board de Sesiones es la pantalla de inicio y se actualiza en vivo

**Rebanada:** 2 · **Roadmap:** §1.2 · **Diseño:** spec/design.md §4, §5.6, §6.1

En `/sesiones` (también al abrir `/`) se ve:
- un resumen de Estados ("3 activas · 2 inactivas · 1 huérfana") y las fichas de uso del periodo seleccionado (AC-13);
- las Sesiones agrupadas por Proyecto, con los grupos plegables y en orden alfabético. Dentro de cada grupo van por inicio, la más nueva primero, y las Cerradas quedan plegadas tras "Mostrar N cerradas". Ni los grupos ni las tarjetas cambian de sitio cuando llegan Eventos o cambia un Estado; solo entra arriba una Sesión nueva;
- en cada tarjeta, los Subagentes en marcha con su tipo, la descripción de su Tarea y su herramienta en curso;
- en cada tarjeta: el Estado, con punto y texto (no solo color), y el tiempo desde la última actividad; el id corto y el modelo; el Directorio, que se puede pulsar para filtrar; un sparkline de la última hora; la Duración activa y la de reloj, con esos nombres; y los contadores de Subagentes y Bloqueos. Una Sesión Trabajando muestra "Trabajando…" con la herramienta en curso. Al pulsar la tarjeta se abre el detalle (AC-19).

Filtros de Estado, Directorio y rango de tiempo (1 h, 24 h, 7 d, todo). Se reflejan en la URL y se conservan al recargar.
El board se refresca al llegar Eventos por WebSocket y cada pocos segundos, para que los Estados cambien solos.
La barra lateral navega entre Board, Eventos y Bloqueos, y muestra el indicador de conexión en vivo (design §4.1).

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
