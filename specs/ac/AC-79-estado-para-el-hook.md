# AC-79 — El servidor dice al hook si hay que parar al agente

**Rebanada:** 15 · **Roadmap:** §1.15 · **ADR:** 0010

`GET /api/v1/budgets/status?session_id=…&project=…` responde `{ stop, checked_at }`:
- `stop` es `null` si el agente puede seguir;
- si no, describe el primer Presupuesto que lo impide (el de más gasto sobre su límite): su `budget_id`, `scope`, `spent_usd`, `limit_usd` y un `reason` en una frase ("Presupuesto por Sesión superado: ~$5,20 de ~$5,00").

Solo impiden seguir los Presupuestos **activos**, con acción `stop`, **Superados** para esa Sesión (`session`), ese Proyecto (`project_day`) o el día (`global_day`) y **sin excepción vigente** (AC-78). Uno en `warn` nunca detiene. Un Presupuesto por Sesión con otro Proyecto no aplica.

La respuesta no relee los Transcripts enteros en cada consulta: el gasto se calcula una vez y se reutiliza unos segundos, y los Transcripts ya leídos solo se vuelven a procesar si cambiaron. Sin `session_id` o sin `project` responde `400`.

**Verificación:** tests de integración (Vitest).
