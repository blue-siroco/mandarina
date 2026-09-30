# AC-91 — Si espera un Subagente, la espera lo dice

**Capa:** backend (dominio y API) · **Rebanada:** 16 · **Roadmap:** §1.16

- Cuando el Evento que causa la espera pertenece a un Subagente (`subagent_id` no nulo: `PermissionRequest`, `Notification` o `AskUserQuestion` de ese carril), la Sesión está Esperando y la espera identifica al Subagente (su id y su Tipo de Subagente, con la descripción de su Tarea si se conoce, AC-33).
- Cuando espera el agente principal, la espera no lleva Subagente aunque haya Subagentes en marcha.
- El Subagente es de la Sesión: no hay Sesión aparte. El enlace de la UI lleva al detalle de la Sesión (AC-24 muestra el Subagente allí).
- Un Subagente interno no aparece como quien espera; la espera se atribuye a la Sesión.

**Verificación:** tests de dominio (Vitest) con Eventos de un Subagente y de la Sesión principal a la vez.
