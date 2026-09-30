# AC-131 — `GET /api/v1/subscription-usage` devuelve la última lectura con el estado al consultar

**Capa:** backend · **Rebanada:** 17 · **Roadmap:** §1.17 · **ADR:** 0012

- Responde `{ usage: null }` si nunca llegó una lectura (cuenta sin suscripción).
- Con lectura responde `{ usage: { five_hour, seven_day, updated_at } }`; cada ventana es `null` o `{ used_percent, remaining_percent, resets_at, status }` (AC-129). `updated_at` es el momento en que llegó la lectura.
- El `status` se recalcula en cada consulta con el reloj del servidor: la misma lectura pasa a `reset_pending` cuando su `resets_at` queda atrás, sin nueva lectura.

**Verificación:** integración HTTP (Vitest) con reloj inyectado.
