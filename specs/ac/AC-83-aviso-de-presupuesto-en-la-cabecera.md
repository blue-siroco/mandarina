# AC-83 — Un aviso destacado y un sonido cuando un Presupuesto está Cerca o Superado

**Rebanada:** 15 · **Roadmap:** §1.15

- Mientras haya algún Presupuesto **activo** Cerca o Superado sin excepción vigente, la cabecera de todas las pantallas muestra un aviso destacado con el peor, su ámbito, lo gastado y el límite ("Presupuesto global del día superado: ~$52 de ~$50"), y un enlace a `/presupuestos`. Si son varios, dice cuántos más hay. Se distingue Cerca de Superado con el texto, no solo con el color, y avisa como región `role="status"`.
- Al llegar por el WebSocket una transición a Cerca o a Superado, suena un sonido corto (Superado, más grave y doble que Cerca), generado en el navegador con Web Audio. Solo suena si la persona usuaria ya ha interactuado con la página (política de autoplay de los navegadores); si no, se omite en silencio. No suena al cargar la página ni por lo que ya estaba Superado, salvo la transición inicial que difunde el backend al arrancar (AC-81).
- Un interruptor **Silenciar avisos** en el aviso y en la pantalla Presupuestos silencia el sonido; se guarda en el navegador (no en la URL ni en el servidor) y por defecto el sonido está activo.
- Al pasar a Dentro (p. ej. tras ampliar el límite) o al desactivar el Presupuesto, el aviso desaparece solo.

**Verificación:** tests de componente y caso de uso (Vitest, con un doble de Web Audio); E2E Playwright con red y WebSocket interceptados.
