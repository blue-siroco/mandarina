# AC-70 — Se detectan las Reescrituras de caché y su causa probable

**Rebanada:** 14 · **Roadmap:** §1.14

Una **Reescritura de caché** es una respuesta del modelo que, con su agente ya en marcha, vuelve a escribir en caché la mayor parte de su contexto en lugar de leerlo. Se busca por agente (el principal y cada Subagente, por separado), con sus respuestas en orden de hora:

- La primera respuesta de un agente nunca es una Reescritura: no tiene caché previa.
- Lo es una respuesta cuya escritura (5 min + 1 h) supera la mitad de sus tokens de entrada (`input + cache_read + escritura`).
- Su **causa** se deduce de los datos, por este orden:
  - `model_change`: la respuesta anterior del mismo agente era de otro modelo;
  - `expired`: pasó más tiempo desde la respuesta anterior que el TTL de la clase de escritura predominante en esta (1 h si escribió más con TTL de 1 h que de 5 min; si no, 5 min);
  - `compaction`: reservada para cuando se capture `PreCompact` (1A.3); hasta entonces no se asigna;
  - `other`: cualquier otra (cambió el prefijo: herramientas, `CLAUDE.md`, prompt de sistema).
- Cada una lleva los tokens escritos, el coste de escribirlos (`null` sin Tarifa), el tiempo desde la respuesta anterior y su agente.
- Las respuestas repetidas entre Transcripts se cuentan una vez.

**Verificación:** tests unitarios del dominio (Vitest).
