# AC-138 — La ficha dice cuándo se reinicia la ventana y cómo de fresca es la lectura

**Capa:** frontend · **Rebanada:** 18 · **Roadmap:** §1.17 · **Amplía:** AC-137

- Cada medidor dice el reinicio en hora local con cuenta atrás: «se reinicia a las 18:40 · en 1 h 12 min». Si no es hoy añade el día («se reinicia el vie 3 a las 22:28 · en 3 d 5 h») y cuenta en días a partir de 24 h; por debajo del minuto dice «menos de 1 min».
- Una ventana `reset_pending`, o cuya hora de reinicio ya pasó aunque el servidor aún no lo sepa, muestra «Ventana reiniciada, pendiente de nueva lectura» y **no** enseña el % antiguo como vigente (ni barra). La otra ventana no se ve afectada.
- Las tarjetas no muestran «Actualizado hace N min»: la frescura del dato no se pinta.
- La cuenta atrás, el «hace N min» y el paso a «reiniciada» se refrescan con un temporizador (cada 30 s), sin esperar otra lectura.

**Verificación:** `subscription-format.spec.ts` (`resetLabel`, `countdown`, `effectiveStatus`), `subscription-card.spec.ts` con reloj simulado; E2E `frontend/e2e/subscription.spec.ts`.
