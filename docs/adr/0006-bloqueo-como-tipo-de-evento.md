# El Bloqueo viaja como un Tipo de evento propio, `tool.blocked`

Cuando una Regla de bloqueo impide una invocación, el Adaptador envía un Evento `tool.blocked` (en lugar del `tool.pre`) con un campo `block` = `{ rule, reason }`. Se descartan dos alternativas: marcar el `tool.pre` con un flag dentro del `payload` (el `payload` es JSON nativo del Harness y no debe llevar semántica de Mandarina) y un endpoint aparte `POST /api/v1/blocks` (el Bloqueo es un hecho observado en la Sesión: debe aparecer en la lista de Eventos, en los carriles y en el WebSocket como cualquier otro).

Amplía la lista de Tipos de evento de ADR-0002 sin cambiar su principio: el nombre es vocabulario de Mandarina, no de Claude Code.

## Consequences

- `block` es opcional y solo aparece en `tool.blocked`; `schema_version` sigue en 1 porque el cambio es aditivo para los Adaptadores.
- Una invocación bloqueada no genera `tool.post`: nunca llegó a ejecutarse.
- Para bloquear, el hook escribe en stdout la decisión `permissionDecision: "deny"` de Claude Code y sale con código 0. Es la única vez que el Adaptador escribe en stdout (ADR-0004 sigue en pie: nunca rompe al Harness).
