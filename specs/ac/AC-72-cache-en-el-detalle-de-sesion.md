# AC-72 — El detalle de Sesión da la eficiencia de su caché y sus Reescrituras

**Rebanada:** 14 · **Roadmap:** §1.14

`GET /api/v1/sessions/{id}` añade:
- `cache`: la eficiencia (AC-69) de todas las respuestas de la Sesión y de sus Subagentes, la misma que cuenta `usage`; `null` sin Transcript;
- `cache_rewrites`: las Reescrituras de caché (AC-70) del agente principal y de cada Subagente, en orden de hora; vacía sin Transcript. Cada una lleva el `subagent_id` de su agente (`null` en el principal).

**Verificación:** tests de integración (Vitest).
