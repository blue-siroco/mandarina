# AC-90 — La Sesión deja de esperar con el siguiente Evento; Stop no es esperar

**Capa:** backend (dominio) · **Rebanada:** 16 · **Roadmap:** §1.16

- Una espera de *permiso* o de *pregunta* termina con el siguiente Evento del mismo carril: `tool.post` (aprobada y ejecutada), `tool.blocked`, un nuevo `tool.pre`, `subagent.stopped` del carril; y, para cualquier carril, con `prompt.submitted`, `turn.ended` o `session.ended`. Los Eventos de otros carriles (un Subagente que sigue trabajando mientras el agente principal espera) no la terminan. Otro `Notification` o `PermissionRequest` de la misma espera no la reinicia ni la termina.
- Una espera de *inactividad* (Sesión entera parada) termina con el siguiente Evento de cualquier carril.
- Tras terminar, la Actividad vuelve a derivarse como hoy: Trabajando si sigue el Turno, En pausa tras `turn.ended`.
- `turn.ended` (Stop) nunca deja la Sesión Esperando: pasa a En pausa y no genera aviso alguno.
- Una Sesión Cerrada o Huérfana no está Esperando (`activity` sigue siendo `null`, AC-14), aunque su último Evento fuera una petición de permiso. Una Sesión Esperando puede estar Activa o Inactiva.
- Al retomar una Sesión Cerrada (`--resume`) no se hereda una espera anterior al cierre.

**Verificación:** tests de dominio (Vitest) para cada transición, incluida la de dos carriles concurrentes.
