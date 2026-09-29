# AC-66 — La pantalla Seguridad lista los Avisos de inyección

**Rebanada:** 13 · **Roadmap:** §1.13 · **Diseño:** spec/design.md

En `/seguridad` (grupo *Observar* de la barra lateral), pestaña **Avisos de inyección** (la de por defecto):
- filtros de periodo (1 h, 24 h, 7 d —por defecto— o todo), severidad (Alta, Media, Baja), patrón, Proyecto y "Ver descartados" (Vigentes, Descartados, Todos), reflejados en la URL (`?periodo=`, `?severidad=`, `?patron=`, `?proyecto=`, `?descartados=`);
- una tabla con hora, severidad (con texto, no solo color), patrón y categoría, fuente (herramienta y origen), Proyecto, el fragmento con el patrón resaltado y las herramientas que vinieron después ("Después: Bash · curl …");
- cada fila enlaza a su Evento en el detalle de Sesión (`/sesiones/<id>`, con el Subagente si lo hay) y tiene un botón **Descartar** (o **Restaurar** si ya lo está) que actúa al momento;
- un texto fijo explica que son avisos y no Bloqueos, que se derivan de las respuestas de las herramientas y que pueden ser falsos positivos.

Sin avisos muestra un estado vacío que explica qué se vigila; un fallo de carga o al descartar se avisa sin romper la pantalla. Se actualiza sola cuando llega por el WebSocket un Evento con avisos. La pestaña activa se refleja en la URL (`?pestana=`).

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
