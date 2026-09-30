# AC-148 — Botón de descarga en el detalle de Sesión y en la pantalla Eventos

**Capa:** frontend (presentación) · **Rebanada:** 19 · **Roadmap:** §1.18 · **ADR:** 0013 · **Usa:** AC-147

- El detalle de Sesión tiene un botón «Descargar Sesión» junto a su cabecera; abre el diálogo de AC-147 en modo Sesión (JSON) con el id de esa Sesión.
- La pantalla Eventos tiene un botón «Descargar Eventos» junto a los filtros; abre el diálogo en modo Eventos (JSONL) con los filtros vigentes (Proyecto, Sesión, rango, tipo y herramienta). Al cambiar un filtro con el diálogo cerrado, la siguiente apertura usa los nuevos.
- No hay botón global de «exportar todo» ni entrada nueva en la barra lateral.
- Ambos botones son alcanzables por teclado, tienen nombre accesible y siguen visibles en pantalla estrecha sin desbordar.
- Sin Sesión cargada o sin Eventos en la lista, el botón está desactivado.

**Verificación:** specs de `session-detail` y `events-page`.
