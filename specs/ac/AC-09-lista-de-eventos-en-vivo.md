# AC-09 — La UI muestra la lista de Eventos y añade los nuevos sin refrescar

**Rebanada:** 1 · **Roadmap:** §1.2 (versión cruda)

Al abrir la app, se ve la lista de los Eventos recientes (más reciente arriba) con: hora, Proyecto, Sesión (id abreviado), Tipo de evento, herramienta y Directorio.
Cuando llega un Evento nuevo por WebSocket, aparece arriba sin recargar, sin duplicados.
Si no hay Eventos, se ve un estado vacío que explica cómo instalar el hook. Si se pierde la conexión en vivo, se indica y se reintenta.
La vista se usa bien en escritorio y sigue siendo legible en pantallas estrechas.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
