# AC-89 — Una pregunta sin responder (`AskUserQuestion`) deja la Sesión Esperando

**Capa:** backend (dominio) · **Rebanada:** 16 · **Roadmap:** §1.16

- Un `tool.pre` de `AskUserQuestion` sin su `tool.post` en el mismo carril, con un Turno en curso, deja la Sesión Esperando con motivo *pregunta* y el texto de la pregunta (`tool_input.questions[0].question` cuando exista, ya enmascarado; si el payload no trae texto legible, motivo *pregunta* sin texto). Se apoya en el mismo Evento abierto que ya alimenta `open_tools`; no requiere hooks nuevos.
- Empieza a esperar en el `occurred_at` del `tool.pre`.
- Con su `tool.post` (o `tool.blocked`) deja de esperar; una herramienta `AskUserQuestion` que ya tiene `tool.post` no cuenta.
- Otras herramientas abiertas (un `Bash` largo sin `tool.post`) no son Esperando: siguen siendo Trabajando.
- Si además hay un `PermissionRequest` para la misma herramienta abierta, es una sola espera (prevalece el motivo *pregunta*).

**Verificación:** tests de dominio (Vitest) con secuencias `tool.pre` / `tool.post` de `AskUserQuestion` y de `Bash`.
