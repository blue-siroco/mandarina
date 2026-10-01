# AC-140 — Sin lectura de la cuota, el board lo dice en una línea discreta

**Capa:** frontend (presentación + E2E) · **Rebanada:** 18 · **Roadmap:** §1.17 · **Amplía:** AC-137, AC-139

Sin suscripción y con la suscripción pero sin la `statusLine` del Adaptador el board recibe lo mismo (`usage: null`), así que la ausencia se explica de forma que valga para los dos casos, sin enseñar una ficha vacía ni un 0 %.

- Con la primera respuesta ya recibida y `usage` nulo (o sin ninguna ventana), en lugar de la ficha se pinta una línea pequeña y neutra, `data-testid="subscription-empty"`, con el texto «Uso de la suscripción: sin datos» y un desplegable con la explicación. No es una ficha: no lleva medidores ni cifras.
- La explicación dice que (1) con API key, Bedrock o Vertex no hay cuota que mostrar y es normal, y (2) con Pro o Max hay que registrar `statusline.mjs` del Adaptador como `statusLine` y esperar a la primera respuesta de una Sesión.
- Antes de la primera respuesta (`loaded` falso) no se pinta nada, para no parpadear. Un fallo de red sin lectura previa tampoco cambia lo que se ve.
- Con datos, la línea no existe y la ficha se ve como en AC-137; un mensaje `subscription.usage` con `usage: null` cambia la ficha por la línea, y uno con datos hace lo contrario.
- El resto de fichas del board no cambian (siguen siendo seis).

**Verificación:** `subscription-card.spec.ts`; E2E `frontend/e2e/subscription.spec.ts`.
