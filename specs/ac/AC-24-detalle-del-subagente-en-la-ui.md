# AC-24 — La UI muestra qué está haciendo cada Subagente

**Rebanada:** 3b · **Roadmap:** §1.3 · **Diseño:** spec/design.md §6.1, §6.3

- En el detalle de Sesión, pestaña *Subagentes*, cada fila se expande con la Tarea del Subagente (descripción y prompt completo), la lista ordenada de herramientas con su entrada resumida y su resultado (bien, error, bloqueado o en curso, con texto y no solo color), y la respuesta final. Mientras el Subagente sigue en marcha, lo dice en lugar de la respuesta.
- En el board, la tarjeta de una Sesión lista sus Subagentes en marcha: tipo, descripción de la Tarea y herramienta en curso.
- Sin Transcript, la fila expandida dice que la Tarea y la respuesta no están disponibles y sigue mostrando las herramientas que llegaron por Eventos.

**Verificación:** tests de componente (Vitest); E2E Playwright con red interceptada.
