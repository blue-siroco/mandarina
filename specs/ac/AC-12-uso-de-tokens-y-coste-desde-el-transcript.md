# AC-12 — La API suma el Uso de tokens y el Coste estimado desde los Transcripts

**Rebanada:** 1b · **Roadmap:** §1.3, §4 · **ADR:** 0003, 0005

Para las Sesiones del AC-11, el backend lee su Transcript (y los de sus Subagentes, en `<sesión>/subagents/*.jsonl`) traduciendo la ruta del host al volumen montado, y suma el Uso de tokens de las respuestas del modelo con `timestamp` desde `since`:
- entrada, salida, lectura de caché y escritura de caché, por modelo y en total;
- cada respuesta cuenta una sola vez aunque aparezca en varias líneas (mismo `message.id`);
- el Coste estimado aplica la Tarifa del modelo (ADR-0005); un modelo sin Tarifa no suma coste y aparece en `unpriced_models`.

Un Transcript inexistente o ilegible no hace fallar la respuesta: cuenta en `transcripts.unavailable`.

**Verificación:** tests de dominio e integración (Vitest).
