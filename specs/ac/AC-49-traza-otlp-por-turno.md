# AC-49 — Cada Turno terminado se convierte en una traza OTLP con la convención OpenInference

**Rebanada:** 11 · **Roadmap:** §1.11 · **ADR:** 0008

Dado un Turno terminado, su traza es un `ExportTraceServiceRequest` de OTLP/JSON con:
- un recurso con `service.name=mandarina`, `mandarina.project`, `mandarina.directory` y `mandarina.harness`;
- un span raíz `AGENT` (`openinference.span.kind`) del `prompt.submitted` al `turn.ended`, con `session.id`, `mandarina.turn.index` y el Coste estimado del Turno (`mandarina.cost.usd`);
- un span `LLM` por respuesta del modelo del Transcript dentro del Turno (sin repetir `message.id`), con `llm.model_name`, `llm.token_count.prompt` / `completion` / `total`, `llm.token_count.prompt_details.cache_read` / `cache_write`, `gen_ai.usage.input_tokens` / `output_tokens` y su coste. Empieza en la marca anterior de su carril (inicio del Turno o del Subagente, fin de una herramienta o respuesta previa) y acaba en la hora de la respuesta;
- un span `TOOL` por invocación (`tool.pre` enlazado con su `tool.post` por `tool_use_id`), con `tool.name`. Si terminó con error lleva estado `ERROR` con la primera línea del error; sin `tool.post` acaba con el Turno y lleva `mandarina.tool.status=no_response`. Un `tool.blocked` es un span `TOOL` con estado `ERROR` y un evento `mandarina.block` con la regla y el motivo;
- un span `AGENT` por Subagente del Turno, hijo del span `TOOL` de su Lanzamiento (o del raíz si no se enlazó), con `mandarina.subagent.type`. Sus herramientas y respuestas cuelgan de él.

Los ids son deterministas: el `trace_id` sale de la Sesión y el Turno, y cada `span_id` del Evento o de la respuesta que lo origina. Construir dos veces la misma traza da los mismos ids.

Un Turno sin `turn.ended` cuya Sesión está Cerrada o Huérfana acaba en su último Evento.

**Verificación:** tests unitarios del dominio (Vitest).
