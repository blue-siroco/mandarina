# AC-133 — `/metrics` deja de exponer llamadas, prompts y Bloqueos

**Capa:** backend + contrato + mock · **Rebanada:** 17 · **Roadmap:** §1.17

La ficha *Herramientas* se retira del board y con ella su caso en el desglose (AC-38). Ninguna otra pantalla usaba esas cifras, así que:
- `GET /api/v1/metrics` ya no devuelve `activity.tool_calls`, `activity.prompts` ni `activity.blocks`; `activity` queda con `events`.
- `MetricsSlice` (filas del `breakdown`) ya no tiene `activity`.
- Los Bloqueos siguen visibles en su pantalla, en el detalle de Sesión y en `GET /events?event_type=tool.blocked` (AC-21); esas vistas no cambian.
- El contrato y el mock reflejan el cambio; el total y las filas del desglose siguen cuadrando en Sesiones, Subagentes, tokens y coste.

**Verificación:** Vitest en `metrics-breakdown.test.ts`, `metrics.integration.test.ts`, `sessions.integration.test.ts`; `node:test` del mock.
