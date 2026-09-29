# AC-13 — La UI muestra fichas de uso del periodo sobre las Sesiones del board

**Rebanada:** 1b · **Roadmap:** §1.2, §1.3 · **Diseño:** spec/design.md §5.3

Encima de las Sesiones del board se ve una fila de fichas KPI con los datos del periodo seleccionado en el board (1 h, 24 h —por defecto—, 7 d o todo el histórico) y de su filtro de Directorio, si lo hay (rebanada 8), rotulada con ese periodo ("Últimas 24 h"); al cambiar el periodo, las fichas se vuelven a pedir con la nueva ventana, que avanza con el reloj en cada refresco: Sesiones Trabajando (con los Subagentes en marcha), Sesiones En pausa (con las Huérfanas), tokens de entrada (con el % leído de caché), tokens de salida (con el modelo principal), Coste estimado (marcado como estimado; avisa si hay modelos sin Tarifa) y herramientas (con prompts y Bloqueos).
Las fichas se refrescan solas cada pocos segundos. Mientras cargan se ve un esqueleto; si la API falla se avisa sin ocultar las últimas cifras conocidas.
La fila se adapta a pantallas estrechas sin desbordar.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
