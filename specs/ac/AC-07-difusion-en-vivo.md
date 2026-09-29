# AC-07 — Los clientes conectados reciben cada Evento en vivo

**Rebanada:** 1 · **Roadmap:** §1.1c

Dado uno o más clientes conectados a `ws://…/ws`,
cuando se acepta un Evento,
entonces cada cliente recibe, después de que el Evento esté persistido, el mensaje `{ "type": "event.ingested", "event": <Evento tal como lo devuelve la API> }`.

**Verificación:** test de integración del backend con cliente WebSocket.
