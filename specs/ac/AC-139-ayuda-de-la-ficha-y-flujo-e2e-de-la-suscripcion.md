# AC-139 — La ausencia de la ficha se explica y el flujo funciona de extremo a extremo

**Capa:** frontend (presentación + E2E) · **Rebanada:** 18 · **Roadmap:** §1.17 · **Amplía:** AC-137

- La ficha lleva una ayuda (`title` y `aria-label`) que explica que el dato es de la cuenta y se comparte entre todas las Sesiones, y que solo aparece con una suscripción de Claude (Pro o Max): con API key, Bedrock o Vertex Claude Code no lo envía. Así la ausencia de la ficha no parece un fallo.
- E2E con red y WebSocket interceptados: con suscripción se ven los dos medidores con su % pendiente, su reinicio con cuenta atrás y el pie «Actualizado hace N min»; con `usage: null` no hay ficha y el board conserva sus seis fichas; un mensaje `subscription.usage` actualiza el %, y uno con `usage: null` retira la ficha; `reset_pending` no enseña el % antiguo.
- Por defecto el mock E2E (`frontend/e2e/fixtures.ts`) responde `{ "usage": null }`, para no alterar el resto de escenarios.

**Verificación:** `subscription-card.spec.ts`; E2E `frontend/e2e/subscription.spec.ts`.
