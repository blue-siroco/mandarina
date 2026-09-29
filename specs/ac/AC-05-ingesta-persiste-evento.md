# AC-05 — La ingesta persiste el Evento aceptado

**Rebanada:** 1 · **Roadmap:** §1.1b

Dado un Evento válido en `POST /api/v1/events`,
entonces el servidor le asigna `id` y `received_at`, lo guarda en SQLite y responde `202` con `{ "id": ... }`.
El Evento sobrevive a un reinicio del backend (volumen persistente).

**Verificación:** tests de integración del backend contra SQLite en memoria; persistencia comprobada con `docker compose restart backend`.
