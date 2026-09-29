# AC-78 — Se puede dejar seguir a un ámbito superado sin cambiar el Presupuesto

**Rebanada:** 15 · **Roadmap:** §1.15

- `POST /api/v1/budgets/{id}/allowances` crea una **excepción** (`201`) con un `session_id` (esa Sesión, hasta que termine, `until: null`) o un `project` (ese Proyecto hasta el fin del día natural de hoy, `until` con esa hora), nunca los dos ni ninguno. `DELETE /api/v1/budgets/{id}/allowances/{allowance_id}` la quita (`204`).
- Responde `400` si vienen los dos o ninguno, o si no encaja con el ámbito del Presupuesto: una Sesión solo en `session`, y un Proyecto solo en `session` con ese Proyecto (o sin Proyecto), en `project_day` de ese Proyecto y en `global_day`. Responde `404` si el Presupuesto o la excepción no existen.
- Mientras una excepción esté vigente, el ámbito al que se aplica figura como `allowed: true` y no cuenta para detener al agente (AC-79) ni para el aviso de Superado, pero su estado y su gasto se siguen mostrando. Una excepción de Proyecto con `until` en el pasado ya no está vigente y se descarta al consultar.
- Las excepciones se guardan en SQLite y sobreviven a los reinicios; se listan en `allowances` del Presupuesto.

**Verificación:** tests de integración (Vitest).
