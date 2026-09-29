# AC-80 — El hook detiene al agente cuando se supera un Presupuesto

**Rebanada:** 15 · **Roadmap:** §1.15 · **ADR:** 0010, que matiza 0004

Después de evaluar las Reglas de bloqueo locales (que mandan y no esperan a la red), el hook consulta `GET /api/v1/budgets/status` en dos hooks y solo en ellos:

- **`PreToolUse`** con `stop`: escribe por stdout `{ "continue": false, "stopReason": "<motivo>" }`, que para al agente en lugar de rechazar solo esa herramienta, y envía un Evento `tool.blocked` con `block: { rule: "budget", reason: "<motivo>" }` (la herramienta y su entrada, enmascaradas como cualquier Evento). Aplica también a las herramientas de los Subagentes.
- **`UserPromptSubmit`** con `stop`: escribe `{ "decision": "block", "reason": "<motivo>" }`, así que el prompt nuevo no llega al modelo, y envía un `tool.blocked` con la regla `budget` (sin herramienta). Mientras el ámbito siga Superado, cada prompt se rechaza.
- **Falla abierto**: sin respuesta en 500 ms, con un error de red o con una respuesta que no se entiende, no detiene nada ni escribe en stdout, y el hook sigue su camino normal. Con Mandarina apagado, el hook no tarda más que su límite habitual (ADR-0004) y sale con 0.
- Si una Regla de bloqueo ya denegó la invocación, no se consulta el presupuesto ni se envía un segundo Bloqueo.
- El motivo dice qué Presupuesto se superó y cuánto, y termina con cómo seguir ("Amplía el límite o permite esta Sesión en Mandarina, /presupuestos").
- El resto de hooks (`PostToolUse`, `Stop`…) nunca consultan el presupuesto.

Los Bloqueos `budget` salen en la pantalla de Bloqueos y en el contador de Bloqueos del board como cualquier otro.

**Verificación:** tests del Adaptador (`node:test`) con un servidor simulado.
