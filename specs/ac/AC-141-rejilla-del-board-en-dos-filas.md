# AC-141 — El board reparte las fichas en dos filas

**Capa:** frontend (presentación + E2E) · **Rebanada:** 18 · **Roadmap:** §1.17 · **Modifica:** AC-137 · **Diseño:** `specs/design.md` §5.3

- En pantalla ancha (≥ 960 px) la rejilla del board tiene cinco columnas. **Primera fila:** Trabajando, En pausa, Tokens de entrada, Tokens de salida y Caché. **Segunda fila:** Coste estimado (una columna), Uso de la suscripción de la ventana de Sesión (dos columnas) y Uso de la suscripción semanal (dos columnas, a la derecha).
- La ficha de suscripción se divide en dos tarjetas independientes, una por ventana (`data-testid="subscription-meter"`, `data-window="five-hour" | "seven-day"`), cada una con su título «Suscripción · Sesión (5 h)» / «Suscripción · Semanal (7 d)» y su ayuda. Una ventana ausente no se pinta.
- En pantallas estrechas la rejilla vuelve a repartir las fichas según el ancho disponible, sin desbordar; con menos de 640 px cada tarjeta ocupa una columna.
- Las fichas de Sesión usan esas mismas cinco columnas en pantalla ancha (≥ 960 px): el número de columnas es fijo y solo se abre una fila nueva cuando la anterior se llena, sin saltar entre disposiciones al actualizarse el board.
- Sin lectura, la segunda fila solo lleva Coste estimado y la línea «sin datos» de AC-140.

**Verificación:** `subscription-card.spec.ts`; E2E `frontend/e2e/subscription.spec.ts`.
