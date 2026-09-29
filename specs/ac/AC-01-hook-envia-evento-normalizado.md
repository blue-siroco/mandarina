# AC-01 — El hook envía un Evento normalizado por cada hook capturado

**Rebanada:** 1 · **Roadmap:** §1.1a, §0.5

Dado el Adaptador de Claude Code registrado para `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`, `Stop` y `SessionEnd`,
cuando Claude Code ejecuta el hook con su JSON nativo por stdin,
entonces el Adaptador envía por HTTP `POST /api/v1/events` un Evento con `schema_version`, `harness = "claude-code"`, `project`, `directory` (el `cwd`), `session_id`, `event_type` normalizado según la tabla de `spec/mvp-fase1.md`, `native_event_type`, `occurred_at` (ISO-8601) y `payload` (el JSON nativo completo); más `tool_name`, `subagent_id` y `transcript_path` cuando el hook los trae.

**Verificación:** tests del Adaptador con fixtures de cada hook.
