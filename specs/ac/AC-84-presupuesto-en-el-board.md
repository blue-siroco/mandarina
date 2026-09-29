# AC-84 — El board enseña el presupuesto global del día y las Sesiones detenidas

**Rebanada:** 15 · **Roadmap:** §1.15

- La ficha **Coste estimado** muestra, si existe un Presupuesto activo `global_day`, una barra de progreso con lo gastado hoy frente a su límite y el porcentaje, con el estado en texto (Dentro, Cerca, Superado). No depende del periodo elegido en el board: el presupuesto es del día natural, y la barra lo dice ("Hoy: ~$12 de ~$50").
- La tarjeta de una Sesión cuyo último Bloqueo lo produjo la regla `budget` lleva un badge "Detenida por presupuesto" con ese texto, además de contar como Bloqueo. Se obtiene de los Bloqueos de la Sesión (`GET /api/v1/sessions`, campo `budget_stopped`).
- En la pantalla de Bloqueos, la regla `budget` se lee como cualquier otra, con su motivo.

**Verificación:** tests de componente y de integración del backend (Vitest); E2E Playwright.
