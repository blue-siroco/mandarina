# AC-36 — Los Eventos y el detalle muestran los Subagentes de forma legible y sin ruido

**Rebanada:** 7 · **Roadmap:** §1.7 · **Diseño:** spec/design.md §6.2, §6.3

- En la lista de Eventos (y en la del detalle), "Subagente iniciado" se resume como `<Tipo> · <tarea>` y "Subagente terminado", además, con la duración (`e2e-builder · generar tests del AC-28 · 3 min`). Sin Tipo ni tarea, el resumen sigue como hasta ahora.
- Los Eventos de Subagentes internos se ocultan en `/eventos` salvo con la casilla "Mostrar internos" (`?internos=1`). El contador "filtrados / cargados" los cuenta como filtrados.
- En la pestaña *Subagentes* del detalle, los internos se ocultan salvo con "Mostrar internos". Los pendientes se ven como En marcha, con su Tipo y su Tarea. `?subagente=<id>` abre esa fila desplegada.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
