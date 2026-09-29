# AC-57 — Se puede evaluar una Sesión, un Turno o un Subagente desde el detalle de Sesión

**Rebanada:** 12 · **Roadmap:** §1.12

Los mismos controles aparecen en tres sitios de `/sesiones/<id>`: la cabecera (la Sesión), cada Turno de la pestaña *Línea de tiempo* y cada Subagente de la pestaña *Subagentes*. Un Subagente pendiente de enlazar y los internos no se pueden evaluar.

- **Puntuación**: dos botones, pulgar arriba y pulgar abajo, con nombre accesible ("Bien", "Mal") y `aria-pressed`. Pulsar el activo lo quita.
- **Etiquetas**: las de la Evaluación como chips que se pueden quitar, un campo para añadir con autocompletado de las ya usadas (`GET /api/v1/evaluations/tags`) y, de sugerencia inicial, `bug-fix`, `hallucination`, `prompt-breakdown` y `refactor`. Se añade con Enter o coma; se normaliza como en AC-54.
- **Nota**: campo de texto de varias líneas.
- **Guardado automático**, sin botón: al puntuar o cambiar Etiquetas se guarda al momento, y la Nota 600 ms después de dejar de escribir o al salir del campo. Se muestra "Guardado" o, si falla, "No se pudo guardar" sin perder lo escrito. Si tras un cambio la Evaluación queda vacía, se borra.
- Se cargan con `GET /api/v1/evaluations?session_id=…` al abrir el detalle. Guardar no recarga el detalle ni lo pisa.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
