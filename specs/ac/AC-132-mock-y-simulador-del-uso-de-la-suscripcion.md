# AC-132 — El mock y el simulador cubren el uso de la suscripción

**Capa:** mock · **Rebanada:** 17 · **Roadmap:** §1.17

- `mock-server/lib/mock-api.mjs` (con `mock-subscription.mjs`) implementa `GET` y `PUT /api/v1/subscription-usage` con las mismas reglas que AC-129 a AC-131 (400, 204, ventanas independientes, `status` al consultar) y difunde `subscription.usage` por el WebSocket.
- `serve` arranca con datos semilla de una cuenta de suscripción (la ventana de 5 h cerca del límite y la semanal holgada); `--no-subscription` lo arranca con `usage: null`, como una cuenta con API key.
- El simulador (`send`) envía lecturas de suscripción (una al empezar y otra cada pocos Eventos), como haría el Adaptador desde la `statusLine`; `--no-subscription` no las envía.
- README del mock actualizado.

**Verificación:** `node:test` del mock.
