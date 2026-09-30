# AC-126 — Estado del Subagente coherente tras el fin de Turno

**Capa:** backend (dominio, aplicación, contrato) + frontend · **Rebanada:** 17 · **Roadmap:** §1.7, §1.10

- Regla única (extiende AC-125): un Subagente sin `subagent.stopped` solo está **en marcha** si su Sesión está viva (Activa o Inactiva) **y** con el Turno abierto (Trabajando o Esperando). Si no, está **sin respuesta**. `summarizeSession` expone esa condición como `turn_open` y el resto de casos de uso la reutilizan.
- `GET /api/v1/subagents` y `GET /api/v1/agents` (y el perfil de cada Tipo): un Lanzamiento sin fin con el Turno terminado tiene `status: no_response`, sale de "en marcha" en las tablas y KPIs, y su duración llega hasta el último Evento de la Sesión, no hasta ahora. Con un `prompt.submitted` nuevo vuelve a `running`.
- `GET /api/v1/sessions/{id}`: cada Subagente lleva `status` (`running` | `finished` | `no_response`, campo requerido en `specs/api-spec.yaml`) con la misma regla; con `stopped_at` informado es siempre `finished`.
- Las métricas (`subagents_running`) no cuentan esos Subagentes (ya cubierto en AC-125 vía `running_subagents_list`).
- La pestaña Subagentes del detalle muestra el estado siempre con texto: `running` → "En marcha" y "Sigue en marcha: la respuesta aparecerá al terminar."; `no_response` → "Sin respuesta" y "El Turno terminó sin que el Subagente avisara de su fin."; `finished` → su duración. El mapper deduce `status` de `stopped_at` si un backend anterior no lo envía.
- El mock (`mock-server/`) replica la regla en el detalle, `/subagents`, `/agents` y `/metrics`.

**Verificación:** Vitest en `session-summary.test.ts`, `subagents.integration.test.ts` (lista, `/agents`, detalle y métricas) y `sessions.integration.test.ts`; specs del mapper de sesiones y de `SubagentList`; `node:test` del mock; E2E `frontend/e2e/subagents.spec.ts` con red interceptada.
