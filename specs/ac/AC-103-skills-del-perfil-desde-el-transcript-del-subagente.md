# AC-103 — Las skills del perfil de un Tipo de Subagente incluyen las del Transcript

**Rebanada:** 10 · **Roadmap:** §1.10

Las skills de un Lanzamiento (AC-45) y, por tanto, las del perfil del Tipo (AC-46, `skills`) salen de los `tool.pre` de `Skill` del hook **y** de los `tool_use` de `Skill` del Transcript del Subagente (AC-29).
- Se unen por `tool_use_id`: una skill que consta en ambos sitios cuenta una sola vez.
- Un Subagente sin Eventos propios (corrió sin hook) aporta igualmente las de su Transcript.
- Las skills del Transcript del agente principal no se atribuyen a ningún Subagente.

**Verificación:** test de dominio (Vitest) de `ownActivity` y test de integración de `GET /api/v1/agents/{type}` con un Transcript de Subagente.
