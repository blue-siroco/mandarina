# AC-88 — Una Sesión con un Turno en curso pasa a Esperando cuando pide permiso o queda inactiva

**Capa:** backend (dominio) · **Rebanada:** 16 · **Roadmap:** §1.16 · **Amplía:** AC-14

La Actividad de la Sesión (AC-11, AC-14) gana un tercer valor, **Esperando**, solo en Sesiones Activas o Inactivas con un Turno en curso.

- **Permiso**: tras un Evento `PermissionRequest` sin ningún Evento posterior del mismo carril (agente principal o Subagente), la Sesión está Esperando con motivo *permiso*, la herramienta (`tool_name`) y un resumen de su entrada (el comando de `Bash`, la ruta de `Edit`/`Write`…), ya enmascarados. Un `Notification` de permiso (`notification_type = permission_prompt`) sin `PermissionRequest` previo produce la misma espera, con el texto del `message` como resumen y sin herramienta. Si llegan ambos para la misma espera, es una sola espera con un solo instante de inicio (el del primero) y el motivo con más detalle (herramienta y comando).
- **Inactividad**: un `Notification` de inactividad (`notification_type = idle_prompt`) con un Turno en curso deja la Sesión Esperando con motivo *inactividad*. Si el Turno ya terminó (`turn.ended` anterior), esa notificación no cambia la Actividad: la Sesión sigue En pausa (Stop no es esperar).
- Si el `Notification` no trae `notification_type`, el motivo se infiere del `message` solo cuando es inequívoco (contiene "permission" o "waiting for your input"); si no lo es, el Evento se guarda pero la Sesión no pasa a Esperando.
- `Notification` de otros tipos (p. ej. `auth_success`) se guardan y no cambian la Actividad.
- La espera lleva su instante de inicio (`occurred_at` del primer Evento que la causó).

**Verificación:** tests de dominio (Vitest) sobre `summarizeSession` con secuencias de Eventos; incluye el caso de duplicado `PermissionRequest` + `Notification`.
