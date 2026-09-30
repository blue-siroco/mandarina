# Tipos de evento con vocabulario propio, no con los nombres de Claude Code

Los Eventos se guardan con un Tipo de evento normalizado (`session.started`, `tool.pre`, `tool.post`, `prompt.submitted`, `subagent.started`, `subagent.stopped`, `turn.ended`, `session.ended`) y el nombre nativo del hook (`PreToolUse`…) se conserva aparte. La alternativa obvia —usar los nombres de Claude Code como vocabulario común porque es el primer Harness— filtraría sus particularidades al servidor, la base de datos y el dashboard; con vocabulario propio, añadir un Harness nuevo es solo escribir un Adaptador (roadmap §0.5).

## Consequences

- El hook `Stop` de Claude Code se mapea a `turn.ended`, no a un "fin de sesión": se dispara al acabar cada Turno. El fin de la Sesión es solo `session.ended`.
- ADR-0006 añade `tool.blocked`; ADR-0011 añade `permission.requested` (`PermissionRequest`) y `session.notified` (`Notification`), que alimentan la Actividad *Esperando*.
