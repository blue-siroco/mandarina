# AC-130 — `PUT /api/v1/subscription-usage` guarda la última lectura y la difunde

**Capa:** backend · **Rebanada:** 17 · **Roadmap:** §1.17 · **ADR:** 0012

- Cuerpo `{ session_id?, five_hour?, seven_day? }` con `additionalProperties: false`; cada ventana `{ used_percentage (0..100), resets_at (entero, epoch en segundos) }`. Responde 204.
- Sin ninguna ventana, un porcentaje fuera de 0..100, un `resets_at` que no es entero o un campo desconocido responden 400 y no cambian lo guardado.
- Guarda una fila singleton en SQLite (la última lectura de la cuenta, no por Sesión) que sobrevive a un reinicio. Una ventana ausente conserva la anterior solo si su `resets_at` sigue en el futuro (AC-129).
- Difunde por el WebSocket `{ "type": "subscription.usage", "usage": <SubscriptionUsage> }` con el estado ya calculado, a todos los clientes conectados. Un 400 no difunde nada.

**Verificación:** integración HTTP + WebSocket (Vitest) en `backend/test/subscription-usage.integration.test.ts`.
