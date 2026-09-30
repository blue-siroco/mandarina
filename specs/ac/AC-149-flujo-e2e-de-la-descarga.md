# AC-149 — Flujo E2E: descargar una Sesión y unos Eventos filtrados

**Capa:** E2E (Playwright, red interceptada) · **Rebanada:** 19 · **Roadmap:** §1.18 · **ADR:** 0013 · **Verifica:** AC-147, AC-148

- Desde el detalle de una Sesión: «Descargar Sesión» abre el diálogo con el recuento y los campos de estructura; con la casilla desmarcada, la petición de descarga lleva `content=false` y el enlace de descarga tiene el atributo `download` y el `href` lleva `content=false`; el nombre `mandarina-sesion-*.json` lo pone el servidor (`Content-Disposition`) y lo cubren los tests de backend y mock (AC-142), porque una descarga por `<a download>` no pasa por `page.route`.
- Marcar «Incluir contenido» cambia la lista de campos y la petición pasa a `content=true`; al cerrar y volver a abrir, la casilla vuelve a estar desmarcada.
- Desde Eventos: filtrar por un Proyecto y una herramienta y pulsar «Descargar Eventos»: la vista previa y la descarga llevan esos filtros y el `href` los lleva; el nombre `mandarina-eventos-*.jsonl` lo cubren los tests de backend y mock (AC-144).
- Con una vista previa `truncated: true` el aviso de Eventos que quedan fuera es visible.
- Con `total` 0 «Descargar» está desactivado.
- Todo con `page.route` sobre las peticiones `.../export` y `.../export/preview`; sin backend real ni Prism.

**Verificación:** `frontend/e2e/export.spec.ts`.
