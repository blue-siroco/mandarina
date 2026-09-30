# AC-145 — Una descarga con demasiados Eventos se trunca y lo dice

**Capa:** backend · **Rebanada:** 19 · **Roadmap:** §1.18 · **ADR:** 0013 · **Aplica a:** AC-142 y AC-144

- El tope es de **50 000 Eventos por descarga** (constante del backend, no configurable en el MVP). Si se supera, se descargan los **más recientes** y se omiten los más antiguos.
- La cabecera del fichero lleva `truncated: true`, `total` (los que pasaban los filtros), `exported` (los incluidos) y `omitted` (`total − exported`). En la Descarga de Sesión estos campos están en `export`.
- Dentro del tope, `truncated: false` y `omitted: 0`.
- El recuento previo se obtiene sin leer los Eventos: la vista previa de AC-147 lo usa mediante `GET /api/v1/events/export/preview` y `GET /api/v1/sessions/{id}/export/preview`, que aceptan los mismos parámetros que su descarga, devuelven `{ total, exported, truncated, omitted, fields }` y no descargan nada. `fields` depende de `content` (AC-143).

**Verificación:** tests con el tope bajado por inyección (no 50 000 Eventos reales).
