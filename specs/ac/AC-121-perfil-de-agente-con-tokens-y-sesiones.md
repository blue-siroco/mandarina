# AC-121 — El perfil de un Tipo de Subagente y la comparativa muestran los tokens y las Sesiones

**Capa:** frontend · **Roadmap:** §1.10 · **Amplía:** AC-47, AC-48 · **Reutiliza:** AC-46 (`summary.tokens`, `summary.sessions`)

- El perfil de un Tipo (`/agentes/:tipo`) añade a sus KPIs una ficha **Tokens** (entrada más salida en formato compacto, con el detalle entrada / salida) y una ficha **Sesiones** (nº de Sesiones con al menos un Lanzamiento del Tipo). Los datos ya los da la API; no hay endpoint nuevo.
- La tabla comparativa de `/agentes` añade las columnas **Tokens** y **Sesiones**, ordenables como las demás, sin alterar las existentes.

**Verificación:** tests unitarios (Vitest) de `AgentProfilePage` y `AgentsPage`; E2E de `/agentes` con red interceptada.
