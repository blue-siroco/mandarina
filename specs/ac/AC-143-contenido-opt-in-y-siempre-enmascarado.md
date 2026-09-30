# AC-143 — El contenido de una descarga es opt-in y sale siempre enmascarado

**Capa:** backend (caso de uso + HTTP) · **Rebanada:** 19 · **Roadmap:** §1.18 · **ADR:** 0013, 0009 · **Aplica a:** AC-142 y AC-144

- El parámetro `content=true` en ambos endpoints de descarga incluye prompts, respuestas del modelo y entradas y salidas de herramientas; sin él, o con `content=false`, no se incluye ninguno (AC-142). Cualquier otro valor responde `400`.
- Con `content=true` todo texto del fichero pasa por el enmascarado de secretos y PII de ADR-0009, también lo que se lee del Transcript para completar la Sesión: un secreto presente en el Transcript sale como `[REDACTED_*]`, nunca en claro.
- El enmascarado se aplica aunque el Evento ya estuviera enmascarado al ingerirlo (doble red de seguridad); un texto ya enmascarado no cambia.
- `include_content` del bloque `export` refleja lo pedido.
- Un test con un secreto en un Evento y otro en el Transcript comprueba que ninguno aparece en claro con `content=true`.

**Verificación:** tests de `export-session` y `export-events` con fixtures de secretos y PII.
