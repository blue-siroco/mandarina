# AC-65 — La API cuenta los marcadores de Enmascarado por Proyecto y tipo

**Rebanada:** 13 · **Roadmap:** §1.13

`GET /api/v1/masking-stats?since=…` cuenta los marcadores `[REDACTED_…]` que hay en los `payload` de los Eventos recibidos desde `since`:
- `totals`: marcadores por tipo (`API_KEY`, `TOKEN`, `PRIVATE_KEY`, `PASSWORD`, `EMAIL`, `PHONE`, `IBAN`, `CARD`, `ID`), con todos los tipos presentes aunque sean 0;
- `items`: una fila por Proyecto con al menos un marcador, con su total y su recuento por tipo, la de más marcadores primero.

Cuenta ocurrencias, no Eventos. Lo enmascarado con `***` antes de ADR-0009 no cuenta. Sin `since`, o con una fecha inválida, responde `400`.

**Verificación:** tests de integración (Vitest).
