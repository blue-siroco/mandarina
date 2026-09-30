# AC-111 — La lista de Eventos en vivo respeta los filtros activos

**Capa:** frontend · **Rebanada:** 1 · **Roadmap:** §1.2 · **Depende de:** AC-110

Un `event.ingested` por WebSocket solo entra en la lista de `/eventos` si cumple los filtros de Proyecto y Sesión activos (mismo Proyecto y misma Sesión). El periodo no filtra lo en vivo: un Evento nuevo siempre cae dentro de él. Los Eventos que no cumplen se descartan sin alterar el contador ni el resto de la lista.

**Verificación:** tests de caso de uso (Vitest); E2E en AC-115.
