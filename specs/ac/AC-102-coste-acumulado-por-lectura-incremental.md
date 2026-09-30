# AC-102 — El coste acumulado de una Sesión se lee de forma incremental

**Rebanada:** 15 · **Roadmap:** §1.15 · **ADR:** 0010

El gasto de los Presupuestos (AC-77) no relee ni reparsea el Transcript entero cada vez que crece: por cada fichero (agente principal y cada Subagente) conserva el offset leído, las respuestas acumuladas y la línea incompleta del final, y en cada consulta solo lee y suma lo añadido.
- El resultado es idéntico al de una lectura completa (`read`), con varias lecturas intermedias, appends parciales y una línea cortada a mitad (que se completa en el siguiente append, sin perderse ni contarse dos veces). Una última línea válida sin salto de línea cuenta, como en la lectura completa.
- Las respuestas se deduplican por `message.id` igual que hoy (gana la última línea).
- Si el fichero se trunca o se reescribe (tamaño menor que el offset, o mismo tamaño con otro mtime) se relee entero.
- Un Transcript inexistente da `undefined` (gasto 0).

**Verificación:** tests de equivalencia (Vitest) y los de integración de Presupuestos (AC-77) sin cambios.
