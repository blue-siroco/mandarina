# AC-21 — El servidor registra los Bloqueos y permite consultarlos

**Rebanada:** 4 · **Roadmap:** §1.4 · **ADR:** 0004, 0006

`POST /api/v1/events` acepta `event_type: tool.blocked` con `block: { rule, reason }`, que se enmascara, se persiste y se difunde como cualquier otro Evento. Un `block` con campos vacíos o de más se rechaza con 400.
En la API, todos los Eventos llevan `block` (`null` salvo en `tool.blocked`). Una base de datos anterior a esta rebanada se migra sola al arrancar.
Los Bloqueos se consultan con `GET /api/v1/events?event_type=tool.blocked&since=…`; `GET /api/v1/metrics` ya no los cuenta (AC-133), y el detalle de Sesión los lista con regla, motivo y entrada resumida.

**Verificación:** tests de integración (Vitest).
