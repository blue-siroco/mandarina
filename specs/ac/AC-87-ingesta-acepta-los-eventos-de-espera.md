# AC-87 — La ingesta acepta, enmascara, persiste y difunde los Eventos de espera

**Capa:** backend (+ contrato) · **Rebanada:** 16 · **Roadmap:** §1.16

- `spec/api-spec.yaml` (`EventType`) incluye los dos Tipos de evento nuevos, y se cambia antes que el código.
- `POST /api/v1/events` responde 2xx a un Evento de cada Tipo nuevo, lo guarda con el `payload` enmascarado también en el servidor (AC-62), y aparece en `GET /api/v1/events` con su Tipo y su `native_event_type`. Un Tipo desconocido sigue rechazándose con 400 (AC-04).
- Cada Evento aceptado se difunde por el WebSocket como `event.ingested` (AC-07), sin mensajes nuevos: los clientes ignoran lo que no conocen.
- Los Eventos nuevos cuentan como Eventos en `event_count` y como actividad reciente de la Sesión (AC-14), pero no como `tool.pre` ni como prompt en `tool_count`, `prompt_count` ni Turnos.

**Verificación:** tests de integración del backend (Vitest) con la ingesta real sobre SQLite en memoria.
