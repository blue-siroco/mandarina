# AC-77 — Se calcula lo gastado y el estado de cada Presupuesto

**Rebanada:** 15 · **Roadmap:** §1.15

`GET /api/v1/budgets` devuelve cada Presupuesto con su estado y lo gastado, calculado con el Coste estimado de los Transcripts (ADR-0005):

- **Día natural**: de las 00:00 a las 24:00 en la zona horaria del backend (`TZ`). Lo gastado hoy en un ámbito del día es el coste de las respuestas del modelo con hora de hoy, de las Sesiones con actividad hoy y de sus Subagentes.
- **`project_day`**: lo gastado hoy en el Proyecto. **`global_day`**: lo gastado hoy en todos.
- **`session`**: lo gastado por cada Sesión con actividad hoy, en toda su vida (no solo hoy), con el filtro de Proyecto del Presupuesto si lo tiene.
- **Estado** por ámbito: **Dentro** por debajo del umbral (`warn_ratio × límite`), **Cerca** desde el umbral hasta el límite (incluido) y **Superado** por encima del límite.
- `subjects` da lo gastado (`spent_usd`, `ratio` = gastado / límite), el estado y si tiene una excepción vigente (`allowed`): uno en los del día; en `session`, las Sesiones de hoy Cerca o Superadas, las peores primero y como máximo 20. `sessions_tracked` cuenta las Sesiones de hoy a las que se aplica. El `state` y el `spent_usd` del Presupuesto son los del peor de sus ámbitos.
- Un modelo sin Tarifa no suma coste, como en el resto de la app; sin Transcript, la Sesión gasta 0.
- Un Presupuesto desactivado sigue mostrando lo gastado, pero no avisa ni detiene.

**Verificación:** tests unitarios del dominio y de integración con Transcripts (Vitest).
