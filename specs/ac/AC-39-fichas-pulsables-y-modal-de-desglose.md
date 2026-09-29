# AC-39 — Cada ficha del board abre su desglose en un modal

**Rebanada:** 8 · **Roadmap:** §1.8 · **Diseño:** spec/design.md §5.3b

- Las fichas de uso del board siguen su filtro de Directorio (AC-13, AC-16).
- Cada ficha se puede pulsar, o activar con Enter o Espacio. Abre un modal titulado con la métrica y el periodo ("Coste estimado · Últimos 7 días"), con las pestañas **Por Directorio** y **Por modelo**. Se abre en la última pestaña usada, que se recuerda en el navegador.
- Con un filtro de Directorio activo, el modal lo indica y solo reparte la actividad de ese Directorio.
- Mientras el modal está abierto, se piden las métricas con `breakdown=true` y se refrescan como las fichas. Si falla un refresco, se avisa y se conservan las últimas cifras.
- El modal se cierra con `Esc`, con el botón de cerrar y pulsando fuera, y el foco vuelve a la ficha.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
