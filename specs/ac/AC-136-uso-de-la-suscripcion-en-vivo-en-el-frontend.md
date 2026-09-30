# AC-136 — El frontend obtiene el uso de la suscripción por REST y por el WebSocket compartido

**Capa:** frontend (puerto, adaptador, mapper, caso de uso) · **Rebanada:** 18 · **Roadmap:** §1.17 · **Contrato:** `GET /api/v1/subscription-usage` y mensaje `subscription.usage` de `spec/api-spec.yaml`

- Puerto `SubscriptionUsageSource` (`current()` y `changes()`), adaptador HTTP + WebSocket y mapper DTO a modelo. `{ usage: null }` es una cuenta sin suscripción; cada ventana (`five_hour`, `seven_day`) puede ser `null` o faltar por separado.
- El mensaje `subscription.usage` llega por el único socket de la app (`HttpWsEventFeed` → `LiveEvents.subscriptionUsage$`); no se abre otra conexión. Los mensajes de otro tipo se siguen ignorando.
- Caso de uso `WatchSubscriptionUsage`: lee la última lectura al suscribirse y cada 60 s, y aplica cada mensaje del WebSocket. Un mensaje con `usage: null` retira la lectura. Un fallo de red conserva la última lectura y marca `failed`.

**Verificación:** `subscription.spec.ts` (mapper, adaptador, `LiveEvents`, caso de uso), `http-ws-event-feed.spec.ts`; E2E `frontend/e2e/subscription.spec.ts`.
