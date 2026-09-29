# AC-71 — Las métricas del board llevan la eficiencia de la caché, también en el desglose

**Rebanada:** 14 · **Roadmap:** §1.14

- `GET /api/v1/metrics` devuelve `cache` (tasa de acierto, tokens leídos y escritos con TTL de 5 min y de 1 h, ahorro bruto, sobrecoste de escritura, ahorro neto, número de Reescrituras de caché y su coste, y modelos sin Tarifa) del periodo y del Directorio pedidos, con las mismas respuestas que ya cuentan los tokens y el Coste estimado.
- Con `breakdown=true`, cada fila de `by_directory` y de `by_model` lleva su `cache`, y sus valores suman el total: tokens, ahorros, sobrecoste, Reescrituras y coste de Reescrituras. La tasa de acierto de una fila se calcula con los tokens de esa fila, no se suma.
- Una Reescritura se atribuye al Directorio de su Sesión y al modelo de su respuesta.
- Sin respuestas en el periodo, `cache` tiene todo a cero y `hit_rate: null`.

**Verificación:** tests de integración (Vitest).
