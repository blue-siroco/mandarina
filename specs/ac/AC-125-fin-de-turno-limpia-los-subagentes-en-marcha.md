# AC-125 — Al terminar el Turno, la Sesión deja de mostrar Subagentes en marcha

**Capa:** backend (dominio) · **Rebanada:** 17 · **Roadmap:** §1.2, §1.7

- Una Sesión con el Turno terminado (`turn.ended` como último Evento de progreso, Actividad *En pausa*) no tiene Subagentes en marcha: `running_subagents` es 0 y `running_subagents_list` está vacía, aunque algún Subagente no haya emitido nunca `subagent.stopped` (hook perdido, lanzamiento pendiente de enlazar). El resto de Subagentes de la Sesión siguen en `subagents` con su estado.
- Con el Turno en curso (Trabajando o Esperando) el comportamiento no cambia: los Subagentes sin `subagent.stopped` cuentan como en marcha.
- La ficha del board y las métricas (`subagents_running`, desgloses) usan esa misma cifra, así que tampoco cuentan a los de una Sesión En pausa.
- Un `prompt.submitted` nuevo reabre el Turno y vuelve a contar los Subagentes sin `subagent.stopped`.

**Verificación:** tests de dominio (Vitest) en `session-summary.test.ts`.
