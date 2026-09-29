# AC-19 — El detalle de Sesión muestra contexto, tokens, línea de tiempo, prompts, Subagentes y Bloqueos

**Rebanada:** 3 · **Roadmap:** §1.3 · **Diseño:** spec/design.md §5.9, §5.10, §6.3

En `/sesiones/:id`:
- **Cabecera**: id corto con botón para copiarlo, Estado, modelo, Harness, Proyecto, Directorio, inicio, Duración activa y de reloj, y número de Turnos.
- **Pestañas**, reflejadas en la URL:
  - *Resumen*: tarjeta de ventana de contexto (cifra, % y barra; > 80 % en `--warn`, > 95 % en `--danger`, marcada "estimado a partir del Transcript"), uso de herramientas en barras horizontales, fichas de tokens (entrada, salida, % de caché, peticiones, Coste estimado), carriles de actividad y la lista de Eventos de la Sesión.
  - *Línea de tiempo*: carriles (uno para el agente principal y uno por Subagente, más un carril de Bloqueos si los hay) y la lista de Turnos numerados, con duración y herramientas.
  - *Prompts*: cada prompt con su hora, Turno, duración y herramientas, y el texto completo.
  - *Subagentes*: tabla de tipo, duración, herramientas, modelo y tokens.
  - *Bloqueos*: los de la Sesión (AC-22).
- Si el Transcript no está disponible, las tarjetas de contexto y tokens dicen "Transcript no disponible" y el resto funciona.
- El detalle se refresca en vivo mientras la Sesión recibe Eventos. Una Sesión inexistente muestra un estado vacío con enlace al board.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
