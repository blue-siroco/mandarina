# El hook consulta al servidor el estado de los Presupuestos y falla abierto

Para detener a un agente que supera su Presupuesto (1.15), el hook necesita saber cuánto lleva gastado. Ese dato solo lo tiene el servidor, porque calcula el Coste estimado leyendo los Transcripts con su tabla de Tarifas (ADR-0005). ADR-0004 dice que el hook decide en local y que "el Bloqueo no puede depender de que Mandarina responda". Decidimos matizarlo solo para los Presupuestos. Después de evaluar las Reglas de bloqueo locales, el hook consulta `GET /api/v1/budgets/status` con un timeout de 500 ms y **falla abierto**: si no hay respuesta a tiempo, no detiene nada. Se descartan dos alternativas:

- **Calcular el coste en el hook** a partir del `transcript_path`: habría que duplicar la tabla de Tarifas y la deduplicación del Uso de tokens en el Adaptador, releer el Transcript en cada herramienta, y solo cubriría el presupuesto por Sesión, no los de Proyecto ni el global por día.
- **Fallar cerrado** (detener si Mandarina no responde): una caída de Mandarina dejaría a Claude Code sin herramientas. La observación nunca rompe el trabajo (§9).

Para parar, el hook devuelve `continue: false` con un `stopReason` en `PreToolUse`, y `decision: "block"` en `UserPromptSubmit`. Un `permissionDecision: "deny"` solo rechaza esa herramienta, y el modelo reintenta o sigue sin ella.

## Consequences

- Cada `PreToolUse` y cada `UserPromptSubmit` añade una consulta local de como mucho 500 ms, y solo si hay algún Presupuesto con acción *detener* activo. El servidor responde desde el coste acumulado en memoria de cada Sesión, leyendo solo lo nuevo de su Transcript.
- Con Mandarina caído, los Presupuestos no protegen. Es el precio de no romper nunca al Harness, y la documentación lo dice.
- La parada se registra como Bloqueo con la regla `budget` (ADR-0006). `tool.blocked` no cambia y `schema_version` sigue en 1.
- La comprobación va antes de cada herramienta, así que una Sesión puede pasarse del límite en lo que cueste la respuesta en curso.
- Los Presupuestos se guardan en el servidor y se editan desde la UI. Las Reglas de bloqueo siguen en el hook (ADR-0004) hasta 2.6.
