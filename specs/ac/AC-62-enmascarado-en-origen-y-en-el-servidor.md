# AC-62 — El Adaptador enmascara antes de enviar y el servidor lo repite

**Rebanada:** 13 · **Roadmap:** §1.13 · **ADR:** 0009

- El Adaptador enmascara el `payload` y el `block` del Evento antes de enviarlo: el secreto no sale del proceso del hook. Las Reglas de bloqueo (ADR-0004) se evalúan antes, sobre el texto original, y el Bloqueo que registran ya sale enmascarado.
- El servidor enmascara el Evento al ingerirlo, aunque el Adaptador ya lo haya hecho, para cubrir Adaptadores antiguos o de otros Harness. Hacerlo dos veces no cambia el resultado.
- El servidor enmascara también lo que lee del Transcript y devuelve o exporta: la Tarea, las herramientas y la respuesta de cada Subagente, y el contenido de la Exportación OTLP (AC-50).
- El Adaptador y el servidor comparten el catálogo de patrones: las mismas fixtures (`masking.json`) se ejecutan en los dos, y un test del Adaptador comprueba que las dos copias son idénticas.
- El Adaptador lee `MANDARINA_MASK_PII` como el servidor (AC-61). Un fallo enmascarando no impide enviar el Evento ni rompe al Harness (ADR-0004): se descarta el Evento en lugar de enviarlo sin enmascarar.

**Verificación:** tests del Adaptador (`node:test`) y de integración de la ingesta (Vitest).
