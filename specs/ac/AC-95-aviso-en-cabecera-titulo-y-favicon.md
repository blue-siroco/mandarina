# AC-95 — Un aviso en la cabecera, un contador en el título y otro favicon mientras haya Sesiones Esperando

**Capa:** frontend · **Rebanada:** 16 · **Roadmap:** §1.16

- Mientras haya al menos una Sesión Esperando, la cabecera de todas las pantallas muestra un aviso destacado (región `role="status"`, junto al de Presupuestos, AC-83, sin taparlo) con el número de Sesiones que esperan ("2 Sesiones esperando") y un enlace al detalle (`/sesiones/:id`) de la que más tiempo lleva esperando (menor instante de inicio de espera), con su Proyecto y motivo. Si la más antigua espera un Subagente, lo dice. Con una sola Sesión el texto va en singular.
- El título de la pestaña es `(N) Mandarina` con N = Sesiones Esperando; sin ninguna, es el título de la ruta actual (`Board · Mandarina`, `Eventos · Mandarina`…), que el Router reescribe en cada navegación, por eso una estrategia de título propia respeta el contador. Se actualiza sin recargar y se restaura al dejar de haber esperas.
- El favicon cambia a una variante de aviso mientras N > 0 y se restaura después. Funciona aunque la pestaña esté en segundo plano.
- Cuentan Sesiones de todos los Proyectos, no las filtradas en el board. Se actualiza por el WebSocket (refresco tras `event.ingested`) y por el refresco periódico si el WebSocket cae.
- Si `GET /sessions` falla, el aviso conserva el último valor conocido y no muestra un error propio; no rompe la cabecera.
- Desaparece solo cuando ninguna Sesión espera.

**Verificación:** tests de componente y de caso de uso (Vitest) con el título del documento y el `link[rel=icon]` doblados; E2E en AC-98.
