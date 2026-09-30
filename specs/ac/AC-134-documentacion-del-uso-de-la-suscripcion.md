# AC-134 — El ADR, el contrato y las guías reflejan el uso de la suscripción

**Capa:** docs · **Rebanada:** 17 · **Roadmap:** §1.17

- Existe `docs/adr/0012-uso-de-la-suscripcion-por-statusline.md` con el origen del dato (solo `statusLine`), el endpoint dedicado con tabla singleton frente a un Tipo de evento, la deducción de la suscripción por la existencia de datos, el encadenamiento, el fallo abierto (ADR-0004) y el supuesto por verificar.
- `specs/api-spec.yaml` documenta `GET`/`PUT /api/v1/subscription-usage`, `SubscriptionUsage`, `UsageWindow` y el mensaje `subscription.usage` del WebSocket.
- `CONTEXT.md` define **Uso de la suscripción**.
- El README del Adaptador explica cómo registrar `statusLine` en `.claude/settings.json` y cómo encadenar la que ya existiera con `MANDARINA_STATUSLINE_CHAIN`, qué imprime sin cadena y por qué a veces no hay datos (API key, Bedrock, Vertex, primera respuesta pendiente).

**Verificación:** revisión de los documentos; grep de los términos `_Avoid_` en los ficheros cambiados.
