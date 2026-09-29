# AC-45 — El servidor reúne los Lanzamientos de cada Tipo de Subagente y lo que hicieron

**Rebanada:** 10 · **Roadmap:** §1.10

A partir del ciclo de vida del 1.7 (AC-33), sin Tipo de evento nuevo ni cambios en el Adaptador, cada Subagente no interno es un Lanzamiento de su Tipo (o de "Sin Tipo"):
- **estado**: `running` si no ha terminado y su Sesión está viva; `no_response` si no ha terminado y su Sesión está Cerrada o Huérfana; `finished` si terminó;
- **plano**: segundo plano si el `tool_input` de su lanzamiento trae `run_in_background: true` o su `.meta.json` trae `requestShape: background`; primer plano si no;
- **contadores** de sus propias herramientas: con error (`PostToolUseFailure` que no sea una interrupción) y Bloqueos. Son contadores, no estados;
- **lanzador**: el agente principal (`null`), o el `agent_type` que traigan los Eventos del agente principal de la Sesión. Si el `tool.pre` de su lanzamiento lleva `subagent_id`, el Tipo de ese Subagente;
- **qué hace** su Tipo: herramientas por nombre (llamadas, con error, Bloqueos), Invocaciones de skill (AC-29), invocaciones MCP por servidor (AC-41) y Ejecuciones de tests (AC-26) con `subagent_id` de sus Subagentes;
- tokens, modelo, Coste estimado y respuesta salen del Transcript de su Subagente; sin Transcript, son `null`.

`GET /api/v1/subagents` usa los mismos tres estados.

**Verificación:** tests de dominio (Vitest).
