# AC-69 — La tasa de acierto y el ahorro neto de la caché se calculan con las Tarifas

**Rebanada:** 14 · **Roadmap:** §1.14 · **ADR:** 0005

Para un conjunto de respuestas del modelo (Uso de tokens del Transcript, ya sin repetir `message.id`), agrupado por modelo:

- **Tasa de acierto** = `cache_read / (input + cache_read + cache_creation)`, con `cache_creation` la suma de las escrituras de 5 min y de 1 h. Es `null` si no hay tokens de entrada, y nunca sale del rango 0–1.
- **Ahorro bruto** = `cache_read × (Tarifa de entrada − Tarifa de lectura de caché)` por millón de tokens, sumado por modelo.
- **Sobrecoste de escritura** = `cache_creation_5m × entrada × 0,25 + cache_creation_1h × entrada × 1` por millón de tokens: lo que costó escribir en caché por encima de la entrada normal (la escritura vale 1,25× y 2× la entrada; ADR-0005).
- **Ahorro neto** = ahorro bruto − sobrecoste de escritura. Puede ser negativo y no se recorta a cero: escribir mucho y releer poco cuesta dinero.
- Un modelo sin Tarifa no suma a ningún importe y se lista en `unpriced_models`, como en el Coste estimado; sus tokens sí cuentan en la tasa de acierto.
- Los importes se redondean a 6 decimales para no arrastrar coma flotante.

**Verificación:** tests unitarios del dominio (Vitest).
