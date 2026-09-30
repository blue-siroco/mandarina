# AC-114 — La espera de un Subagente enlaza a su fila en el detalle

**Capa:** frontend · **Rebanada:** 16 · **Roadmap:** §1.16 · **Depende de:** AC-91, AC-94, AC-95

Cuando quien espera es un Subagente, su nombre en el badge Esperando (tarjeta, detalle) y en el aviso de la cabecera es un enlace a `/sesiones/<sessionId>?pestana=subagentes&subagente=<subagentId>`, que abre la pestaña Subagentes con su fila expandida (AC-24). Si espera el agente principal no hay enlace. En la tarjeta el enlace se puede pulsar aparte del enlace de la tarjeta.

**Verificación:** tests de componente (Vitest); E2E en AC-115.
