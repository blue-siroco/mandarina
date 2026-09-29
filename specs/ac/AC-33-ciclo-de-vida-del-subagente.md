# AC-33 — El servidor deriva el ciclo de vida de cada Subagente

**Rebanada:** 7 · **Roadmap:** §1.7

De los Eventos de una Sesión (y del Transcript si está disponible), sin Tipo de evento nuevo ni cambios en el Adaptador:

- **Lanzamiento**: un `tool.pre` de `Agent` o `Task` es un lanzamiento con Tipo de Subagente `tool_input.subagent_type`, descripción `tool_input.description` y prompt `tool_input.prompt`.
- **Enlace exacto**: un lanzamiento queda enlazado con el Subagente `X` si `agent-X.meta.json` trae su `tool_use_id` en `toolUseId`, o si el `tool.post` con su `tool_use_id` trae `tool_response.agentId: X`. El prefijo `agent-` de los ids no cuenta.
- **Emparejamiento**: un Subagente sin enlace exacto y con Tipo se empareja con el lanzamiento sin enlazar más antiguo de su Sesión con ese mismo Tipo y lanzado antes de su primer Evento. Dos Subagentes nunca comparten lanzamiento.
- **Pendiente**: un lanzamiento sin Subagente es un Subagente sin `subagent_id`, con el Tipo y la Tarea del lanzamiento.
- **Inicio y fin**: empieza con el primero entre el lanzamiento y su primer Evento. Termina con `subagent.stopped`; si falta, con el `tool.post` de su lanzamiento, salvo que ese `tool.post` sea el de uno en segundo plano (`tool_response.status: async_launched`), que llega al lanzar.
- **Tipo y Tarea**: el Tipo sale de `subagent.started`, `subagent.stopped`, el lanzamiento o el `.meta.json`, en ese orden. La Tarea sale del Transcript o, si no está, del lanzamiento.
- **Interno**: un Subagente cuyo único Evento es `subagent.stopped`, con `agent_type` vacío y sin lanzamiento enlazado.

Un Evento mal formado nunca rompe la derivación.

**Verificación:** tests de dominio (Vitest) con Eventos reales de Claude Code: primer plano, segundo plano, `SubagentStart` perdido, dos lanzamientos del mismo Tipo en paralelo e internos.
