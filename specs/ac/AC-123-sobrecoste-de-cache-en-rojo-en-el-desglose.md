# AC-123 — El ahorro neto de caché negativo se ve en rojo y con texto en el modal de desglose

**Capa:** frontend · **Roadmap:** §1.14 · **Amplía:** AC-74

- En el desglose de la ficha Caché, una celda de **Ahorro neto** negativa (fila o total) se pinta con el color de error (`data-tone="danger"`, como el detalle de la ficha en AC-74) y lleva un `title` «Sobrecoste: la caché costó más de lo que ahorró».
- No depende solo del color: el importe conserva su signo (`~-0,30 US$`).
- Los importes positivos y el resto de columnas no se marcan.

**Verificación:** tests unitarios (Vitest) de `BreakdownModal`; E2E de `/` con red interceptada.
