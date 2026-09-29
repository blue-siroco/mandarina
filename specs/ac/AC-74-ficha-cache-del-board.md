# AC-74 — El board tiene una ficha Caché con su desglose

**Rebanada:** 14 · **Roadmap:** §1.14 · **Diseño:** spec/design.md §5.3b

- El board gana la ficha **Caché** junto a las de tokens y coste: como valor, la tasa de acierto del periodo (`—` sin datos) y, como detalle, el ahorro neto (`Ahorro ~$1,20`, o `Sobrecoste ~$0,30` en rojo y con ese texto si es negativo) y, si las hay, "N Reescrituras". Sigue el periodo y el filtro de Directorio del board, como las demás fichas.
- Es pulsable y se activa con teclado como las otras (AC-39): abre el modal del desglose con **Por Directorio** y **Por modelo** y una fila de total que coincide con la ficha. Sus columnas son: tasa de acierto, tokens leídos, tokens escritos (5 min / 1 h), ahorro bruto, sobrecoste de escritura, ahorro neto y Reescrituras. Se ordena por ahorro neto descendente y por cualquier columna.
- El modal avisa de los modelos sin Tarifa, cuyos importes no suman.
- Un ahorro neto negativo se ve como tal, no como cero.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
