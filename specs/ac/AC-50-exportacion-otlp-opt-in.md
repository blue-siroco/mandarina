# AC-50 — La Exportación OTLP es opt-in y el contenido va con un segundo opt-in

**Rebanada:** 11 · **Roadmap:** §1.11 · **ADR:** 0008

- Sin `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` ni `OTEL_EXPORTER_OTLP_ENDPOINT` no se envía nada a ningún sitio. Con el primero se envía a esa URL tal cual; con el segundo, a `<endpoint>/v1/traces`. Las cabeceras de `OTEL_EXPORTER_OTLP_HEADERS` (`clave=valor` separadas por comas, con los valores decodificados como URL) acompañan cada envío, junto a `content-type: application/json`.
- Sin `MANDARINA_OTLP_INCLUDE_CONTENT=true`, ningún span lleva `input.value` ni `output.value`. Con él:
  - el span raíz lleva el prompt (`input.value`) y la última respuesta del agente (`output.value`, del `turn.ended`);
  - cada span `TOOL`, la entrada y la respuesta de la herramienta en JSON (`input.mime_type` / `output.mime_type`: `application/json`);
  - cada span `AGENT` de Subagente, la Tarea y su respuesta final.
  
  Todo sale de los Eventos guardados, que ya están enmascarados.
- Nunca se exporta `llm.system_prompt`.

**Verificación:** tests unitarios del dominio y de la configuración (Vitest).
