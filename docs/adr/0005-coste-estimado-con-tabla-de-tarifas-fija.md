# Coste estimado con una tabla de Tarifas fija en el backend

Las fichas de uso de la rebanada 1b muestran un Coste estimado, que el roadmap dejaba para la Fase 7 (con tarifas editables). Decidimos adelantarlo con una tabla de Tarifas fija en `backend/src/domain/pricing.ts`, casada por prefijo del id de modelo que aparece en el Transcript, en lugar de esperar a la Fase 7 o de consultar precios a un servicio externo (Mandarina es local y no debe depender de la red).

## Consequences

- El coste es una estimación y la UI lo dice: no incluye descuentos, lotes, modo rápido ni precios de terceros (Bedrock, Vertex).
- Un modelo sin Tarifa no suma coste; la API lo devuelve en `unpriced_models` para que la UI lo avise.
- Cambiar precios exige tocar la tabla y desplegar. La Fase 7 la sustituirá por Tarifas configurables sin revertir esta decisión.
- Los tokens salen del Transcript (ADR-0003), deduplicados por `message.id`: Claude Code escribe una línea por bloque de contenido y todas repiten el mismo `usage`.
