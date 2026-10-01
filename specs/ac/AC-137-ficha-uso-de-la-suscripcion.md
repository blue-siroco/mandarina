# AC-137 — La ficha Uso de la suscripción enseña lo consumido de cada ventana

**Capa:** frontend · **Rebanada:** 18 · **Roadmap:** §1.17 · **Diseño:** `specs/design.md` §5.3 · **Datos:** AC-136

- Solo se pinta si hay lectura (`usage` no es `null`) y al menos una ventana; sin suscripción no hay ficha, ni un 0 %, y el resto de fichas siguen igual. Comparte la rejilla de fichas del board.
- Dos medidores: **Sesión (5 h)** y **Semanal (7 d)**. Una ventana ausente no se pinta.
- Cada medidor enseña el % **consumido** (`used_percent`), no el pendiente, con una barra `role="progressbar"` (`aria-valuemin` 0, `aria-valuemax` 100, `aria-valuenow` el consumido y `aria-label` con el nombre de la ventana).
- El estado se dice siempre con texto además del color: **Holgado**, **Cerca** (queda el 20 % o menos) o **Agotado** (queda 0).
- Un mensaje nuevo del WebSocket actualiza el % sin recargar.
- En pantalla estrecha la ficha no desborda.

**Verificación:** `subscription-card.spec.ts`; E2E `frontend/e2e/subscription.spec.ts`.
