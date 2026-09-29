# AC-75 — La caché se ve en el detalle de Sesión y en los agentes

**Rebanada:** 14 · **Roadmap:** §1.14

- **Detalle de Sesión**: la ficha *Caché* de las fichas de tokens (que hoy solo da el % leído) pasa a dar la tasa de acierto y, como detalle, el ahorro neto (o el sobrecoste, con ese texto, si es negativo). En la pestaña *Línea de tiempo*, cada Reescritura de caché aparece como una marca con su hora, su causa en texto ("Caducada", "Cambio de modelo", "Compactación", "Otra"), los tokens escritos y su coste, y el Subagente si es de uno.
- **`/agentes`**: gana una columna **Caché** con la tasa de acierto de cada Tipo (`—` sin datos), ordenable como las demás.
- **Perfil del Tipo** (`/agentes/<tipo>`): una ficha con su tasa de acierto y su ahorro neto, y la tasa y el ahorro de cada Lanzamiento en su tabla, con un texto que explica que un Subagente arranca con el contexto vacío.

**Verificación:** tests de componente (Vitest) y E2E Playwright con red interceptada.
