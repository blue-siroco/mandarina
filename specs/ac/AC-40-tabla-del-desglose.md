# AC-40 — La tabla del desglose reparte la métrica de la ficha

**Rebanada:** 8 · **Roadmap:** §1.8 · **Diseño:** spec/design.md §5.3b

- La primera fila es el **Total** y coincide con la cifra de la ficha. Las demás van en orden descendente por la métrica de la ficha, y se pueden reordenar pulsando la cabecera de cualquier columna (`aria-sort`).
- Columnas según la ficha:
  - *Trabajando*: Sesiones trabajando y Subagentes en marcha;
  - *En pausa*: Sesiones en pausa y Huérfanas;
  - *Tokens de entrada*: entrada, % leído de caché y tokens escritos en caché;
  - *Tokens de salida*: salida y, por Directorio, el modelo principal;
  - *Coste estimado*: coste y % del total, con aviso de modelos sin Tarifa y de Transcripts no disponibles; por modelo, además, la Tarifa y el coste de entrada, salida, lectura y escritura de caché;
  - *Herramientas*: herramientas, prompts y Bloqueos.
- **Por Directorio**: la ruta va truncada por la izquierda (`…/Codev/mandarina`), completa en el tooltip, junto a su Proyecto. Al pulsar un Directorio se cierra el modal y se aplica ese filtro en el board.
- **Por modelo**: cada fila lleva el badge del modelo; lo que no tiene modelo conocido va a "Modelo desconocido". Estas filas no se pueden pulsar.

**Verificación:** tests de componente (Vitest); E2E Playwright con red interceptada.
