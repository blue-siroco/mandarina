# AC-14 — Cada Sesión tiene un Estado y una Actividad calculados a partir de sus Eventos

**Rebanada:** 2 · **Roadmap:** §1.2 · **Diseño:** spec/design.md §3.3, §5.6

- **Cerrada**: llegó `session.ended` y no se ha retomado después. `claude --resume` y `--continue` reutilizan el `session_id`, así que un `session.started`, un prompt o una herramienta posteriores al cierre devuelven la Sesión a Activa o Inactiva (y, si se abandona, a Huérfana). Un Evento de cola del cierre (`turn.ended`, `subagent.stopped`) no la reabre.
- **Huérfana**: sin `session.ended` y sin actividad en más de 30 min; cuenta como actividad tanto un Evento recibido como la última modificación del Transcript.
- **Activa**: actividad en los últimos 5 min, o un Turno en curso.
- **Inactiva**: el resto.

La Actividad (Trabajando / En pausa, ver AC-11) solo existe en Sesiones Activas o Inactivas.
Un Turno va de un `prompt.submitted` del agente principal a su `turn.ended`; si llega otro prompt antes, el Turno anterior se cierra ahí. La Duración activa es la suma de los Turnos y nunca supera la Duración de reloj (del primer al último Evento).

**Verificación:** tests de dominio (Vitest).
