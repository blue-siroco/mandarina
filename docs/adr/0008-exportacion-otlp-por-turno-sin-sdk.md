# La exportación OTLP es opt-in, por Turno y sin el SDK de OpenTelemetry

El 1.11 reenvía lo observado a colectores OTLP (Jaeger, Tempo, Datadog, Langfuse, Arize Phoenix). Decidimos que el backend exporte **una traza por Turno cuando el Turno termina**, con la convención semántica de OpenInference, por **OTLP/HTTP con JSON escrito a mano**, y solo si se activa. Se descartan tres alternativas:

- **Exportar span a span al ingerir cada Evento**: el Evento no trae tokens ni respuestas del modelo, que salen del Transcript (ADR-0003) y no están completos hasta que acaba el Turno. Exportar en vivo daría spans sin lo que hace útil una traza LLM, y metería trabajo de red en el camino de la ingesta.
- **Una traza por Sesión**: una Sesión dura horas y tiene miles de spans; los colectores de trazas las tratan mal y la traza no se ve hasta que la Sesión se cierra. El Turno es la unidad que un colector sabe mostrar, y la Sesión se recupera con el atributo `session.id` de OpenInference.
- **El SDK de OpenTelemetry** (`@opentelemetry/sdk-trace-node` y su exporter): está pensado para instrumentar el proceso propio con spans en vivo, no para construir trazas a posteriori con tiempos del pasado e ids deterministas, y añade una docena de dependencias. El formato OTLP/JSON es estable y pequeño.

## Consequences

- Apagado por defecto (§9). Se activa con las variables estándar `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` y `OTEL_EXPORTER_OTLP_HEADERS`. El contenido (prompts, respuestas, entradas y salidas de herramientas) necesita además `MANDARINA_OTLP_INCLUDE_CONTENT=true` y sale enmascarado.
- El estado de exportación de cada Turno se guarda en SQLite. Un reinicio reanuda lo pendiente, y un Turno que falla tras 3 reintentos queda como fallido sin frenar a los demás.
- `trace_id` y `span_id` se derivan de la Sesión, el Turno y los ids de Evento: un reintento no genera una traza nueva.
- Sin protobuf ni gRPC: solo colectores que acepten OTLP/HTTP con JSON, que son todos los citados.
- Las métricas y los logs OTLP no entran; si llegan, se decidirá entonces si el SDK compensa.
