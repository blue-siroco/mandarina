# AC-68 — Los avisos se ven en el board, en los Eventos y en la Línea de tiempo

**Rebanada:** 13 · **Roadmap:** §1.13

- La tarjeta del board de una Sesión con `injection_alerts > 0` lleva un badge "N aviso(s) de inyección" que enlaza a `/seguridad?...` filtrado por esa Sesión (severidad alta). Sin avisos, nada.
- En `/eventos` y en la Línea de tiempo del detalle, un Evento con `warnings` sin descartar se marca con un icono y el texto "Aviso de inyección" (con la severidad más alta), no solo con color.
- El filtro de categorías de `/eventos` gana **Avisos**: deja solo los Eventos con avisos vigentes.
- En el detalle del Evento se listan sus avisos (patrón, severidad y descarte) con enlace a `/seguridad`.

**Verificación:** tests de componente (Vitest) y E2E Playwright con red interceptada.
