# AC-81 — El cambio de estado de un Presupuesto se difunde por el WebSocket

**Rebanada:** 15 · **Roadmap:** §1.15

- El backend revisa los Presupuestos cada 10 s (y tras crear, editar o borrar uno, o crear o quitar una excepción). Cuando el estado de un ámbito cambia, difunde a todos los clientes `{ "type": "budget.state", … }` con el Presupuesto, su ámbito, la Sesión si es uno por Sesión, el estado nuevo y el anterior, lo gastado y el límite (`BudgetStateMessage`).
- Se difunde toda transición, también a Dentro (p. ej. tras ampliar el límite), pero no la primera observación de un ámbito que ya estaba Dentro. Al arrancar el backend, lo que ya está Cerca o Superado se difunde una vez, para que un cliente conectado tarde no lo ignore.
- Un Presupuesto desactivado, borrado o con una excepción vigente en ese ámbito no difunde avisos de Superado.
- Los clientes que no entienden el tipo de mensaje lo ignoran; el mensaje `event.ingested` no cambia.
- Nunca frena la ingesta: la revisión corre en segundo plano.

**Verificación:** tests de integración con el WebSocket y un reloj controlado (Vitest).
