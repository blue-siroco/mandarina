# AC-129 — El dominio normaliza la lectura y calcula el estado de cada ventana

**Capa:** backend (dominio) · **Rebanada:** 17 · **Roadmap:** §1.17 · **ADR:** 0012

`backend/src/domain/subscription-usage.ts`, con reloj inyectado:
- `remaining_percent = 100 − used_percent`, acotado a 0..100 y redondeado a un decimal (sin arrastrar decimales de coma flotante); `used_percent` se acota y redondea igual.
- `status` se calcula al consultar: `reset_pending` si `resets_at` es igual o anterior a ahora (gana sobre cualquier porcentaje); `exhausted` si `remaining == 0`; `near` si `remaining <= 20`; si no, `comfortable`. Los umbrales son inclusivos (20 → `near`, 0 → `exhausted`).
- `resets_at` pasa de epoch en segundos a ISO-8601.
- Las ventanas son independientes: una ausente es `null` y no afecta a la otra.
- Al fusionar una lectura nueva con la guardada, una ventana que falta conserva la anterior solo si su `resets_at` sigue en el futuro; una ventana presente siempre sustituye a la anterior.

**Verificación:** Vitest en `backend/test/subscription-usage.test.ts`.
