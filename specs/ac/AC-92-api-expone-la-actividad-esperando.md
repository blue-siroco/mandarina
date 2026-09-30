# AC-92 — La API expone la Actividad Esperando y su motivo

**Capa:** contrato + backend · **Rebanada:** 16 · **Roadmap:** §1.16 · **Amplía:** AC-15, AC-18, AC-11

- `spec/api-spec.yaml` se cambia primero: `SessionSummary.activity` admite `waiting` además de `working`, `paused` y `null`; y `SessionSummary` gana un campo de espera (nombre exacto a fijar en el contrato, p. ej. `waiting`) que es `null` salvo en Sesiones Esperando. Contiene: instante de inicio de la espera, motivo (`permission`, `question` o `idle`), herramienta (o `null`), resumen ya enmascarado (o `null`) y quién espera (Subagente con id y Tipo, o `null` para el agente principal). `SessionDetail` lo hereda por `allOf`.
- `GET /api/v1/sessions` y `GET /api/v1/sessions/{id}` devuelven `activity = "waiting"` y ese campo para una Sesión Esperando, y `null` en el campo para las demás. Los clientes que no conocen `waiting` no se rompen porque el campo es aditivo.
- `GET /api/v1/metrics` (AC-11) cuenta las Sesiones Esperando aparte (`activity.waiting`) y no las suma a *Trabajando* ni a *En pausa*, para que el total siga cuadrando; `subagents_running` no cambia.
- El cambio de Actividad llega al cliente por el WebSocket porque cada Evento que la causa o la termina se difunde como `event.ingested` (AC-87); no se añade un mensaje nuevo. El cliente vuelve a pedir `GET /sessions` para conocer el estado.
- `current_tool` de una Sesión Esperando conserva la herramienta abierta si la hay (permiso, pregunta).

**Verificación:** tests de integración del backend contra el esquema de `api-spec.yaml`; test de contrato que valida la respuesta del backend y la del mock con el mismo esquema.
