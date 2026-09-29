# AC-04 — La ingesta rechaza Eventos que no cumplen el esquema

**Rebanada:** 1

Dado un `POST /api/v1/events` al que le falta un campo obligatorio, con un `event_type` fuera del vocabulario normalizado o con `schema_version` no soportada,
entonces el servidor responde `400`, no persiste nada y no difunde nada por WebSocket.

**Verificación:** tests de integración del backend.
