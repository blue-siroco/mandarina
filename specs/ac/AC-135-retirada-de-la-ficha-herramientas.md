# AC-135 — El board ya no tiene la ficha Herramientas

**Capa:** frontend · **Rebanada:** 18 · **Roadmap:** §1.17 · **Modifica:** AC-13, AC-38, AC-39, AC-40

- El board muestra seis fichas: Trabajando, En pausa, Tokens de entrada, Tokens de salida, Caché y Coste estimado. No hay ficha *Herramientas* (llamadas, prompts y Bloqueos).
- El modal de desglose (AC-39, AC-40) no tiene el caso de esa ficha: ni su título, ni sus columnas (Herramientas, Prompts, Bloqueos). Las demás fichas conservan su desglose.
- El modelo y el mapper de métricas del frontend no dependen del bloque `activity` del API: si el servidor lo envía se ignora, y si falta no pasa nada.
- Las cifras siguen en `/eventos`, `/bloqueos` y el detalle de Sesión (no cambian).

**Verificación:** `usage-summary.spec.ts` (`toKpiCards`, fichas), `breakdown-columns.spec.ts`, `breakdown-modal.spec.ts`; E2E `frontend/e2e/usage.spec.ts`, `breakdown.spec.ts` y `sessions.spec.ts` (seis fichas, sin `data-kpi="tools"`).
