# Los hooks `PermissionRequest` y `Notification` viajan como Tipos de evento propios y alimentan la Actividad Esperando

Para avisar de una Sesión que espera a la persona usuaria (roadmap §1.16) el Adaptador captura dos hooks más de Claude Code y los envía con vocabulario de Mandarina, igual que ADR-0002 y ADR-0006:

| Hook nativo (`native_event_type`) | Tipo de evento | Cuándo |
|---|---|---|
| `PermissionRequest` | `permission.requested` | Claude Code va a mostrar un diálogo de permiso para una herramienta. |
| `Notification` | `session.notified` | Claude Code avisa a la persona usuaria (permiso pendiente, inactividad, etc.). |

Se descarta reutilizar `tool.pre` con un flag o meter `notification_type` en un Tipo genérico: `PermissionRequest` no es una invocación (puede acabar en rechazo), y `Notification` no es de una herramienta. El `payload` es JSON nativo y no lleva semántica de Mandarina.

## Campos normalizados

- `permission.requested`: `tool_name` y `payload` nativo completo (incluye `tool_input`).
- `session.notified`: `payload` nativo completo con `message` y, si viene, `notification_type` (`permission_prompt`, `idle_prompt`, `auth_success`…). Sin `session_id` no produce Evento.
- Ambos conservan `native_event_type`, `session_id`, `subagent_id` (si el hook trae `agent_id`), `project`, `directory`, `occurred_at` y `transcript_path`. Se enmascaran en origen y en el servidor (ADR-0009): `message` y `tool_input` llegan con Marcadores de tipo; `tool_name` y la estructura se conservan.
- `schema_version` sigue en 1: el cambio es aditivo, como en ADR-0006.
- El Adaptador **nunca escribe en stdout** en estos hooks ni decide el permiso: no aprueba, no deniega ni retrasa el diálogo (ADR-0004). No se evalúan Reglas de bloqueo ni Presupuestos (ADR-0010). Sale con código 0 aunque Mandarina no responda.
- No cuentan como `tool.pre` ni como prompt: no suman a `tool_count`, `prompt_count` ni Turnos. Sí cuentan en `event_count` y como actividad reciente.

## Derivación de la Actividad Esperando

*Esperando* es un tercer valor de la Actividad de la Sesión (junto a *Trabajando* y *En pausa*). Se deriva de los Eventos, sin estado propio persistido, y solo con un Turno en curso.

- **Permiso** (`reason = permission`): `permission.requested` sin Evento posterior del mismo carril. Guarda `tool_name` y un resumen de `tool_input` (comando de `Bash`, ruta de `Edit`/`Write`…), enmascarado. Un `session.notified` con `notification_type = permission_prompt` sin `permission.requested` previo produce la misma espera (resumen = `message`, sin herramienta). Si llegan ambos, es una sola espera: inicio del primero, detalle del que más aporta.
- **Pregunta** (`reason = question`): `tool.pre` de `AskUserQuestion` sin `tool.post`/`tool.blocked` en su carril (el mismo Evento abierto que alimenta `open_tools`). Inicio en el `occurred_at` del `tool.pre`; resumen = `tool_input.questions[0].question` si existe. Prevalece sobre un `permission.requested` de la misma herramienta.
- **Inactividad** (`reason = idle`): `session.notified` con `notification_type = idle_prompt` y un Turno en curso. Sin Turno en curso (tras `turn.ended`) no cambia nada: *En pausa*. Sin `notification_type`, el motivo se infiere del `message` solo si es inequívoco; si no, el Evento se guarda y no hay espera. Otros `notification_type` no cambian la Actividad.
- **Fin de la espera**: permiso y pregunta terminan con el siguiente Evento del mismo carril (agente principal o Subagente): `tool.post`, `tool.blocked`, nuevo `tool.pre`, `subagent.stopped`; y con `prompt.submitted`, `turn.ended` o `session.ended` de cualquier carril. Los Eventos de otro carril no la terminan; otro `session.notified` o `permission.requested` de la misma espera no la reinicia. La inactividad (Sesión entera parada) termina con el siguiente Evento de cualquier carril. Tras terminar, la Actividad se deriva como antes.
- **`turn.ended` (`Stop`) no es esperar**: pasa a *En pausa* y no avisa.
- **Subagente**: si el Evento causante lleva `subagent_id`, la espera identifica al Subagente (id y Tipo de Subagente). Si espera el agente principal no lleva Subagente aunque haya otros en marcha. Un Subagente interno no aparece como quien espera. No hay Sesión aparte.
- **Al retomar** una Sesión Cerrada (`--resume`) no se hereda una espera anterior al cierre.

## Interacción con el Estado de la Sesión (Huérfana)

*Esperando* solo existe en Sesiones **Activas o Inactivas**; el Estado de la Sesión (AC-14) manda sobre la Actividad. Una Sesión **Cerrada o Huérfana no está Esperando** (`activity = null`, `waiting = null`), aunque su último Evento fuera una petición de permiso. Se elige esto en lugar de eximir a las esperas de volverse Huérfanas porque deja intactos AC-14, AC-88 y AC-90 y evita avisar de una Sesión cuyo proceso probablemente murió.

Limitación asumida: una espera que supere el umbral de Huérfana de AC-14 (sin actividad prolongada y sin Cerrar) deja de contar como Esperando y el aviso desaparece. Antes de eso, una Sesión Esperando puede pasar de Activa a Inactiva sin dejar de esperar.

## Contrato y tiempo real

- `EventType` incorpora `permission.requested` y `session.notified`.
- `SessionSummary.activity` admite `waiting` y `SessionSummary` gana `waiting` (objeto o `null`); `SessionDetail` lo hereda. `GET /metrics` cuenta `activity.waiting` aparte de *Trabajando* y *En pausa*.
- **Sin mensaje WebSocket nuevo**: cada Evento que causa o termina la espera se difunde como `event.ingested` (AC-07) y el cliente refresca `GET /sessions`. Los clientes que no conocen `waiting` no se rompen: el cambio es aditivo.

Amplía la lista de Tipos de evento de ADR-0002 sin cambiar su principio.
