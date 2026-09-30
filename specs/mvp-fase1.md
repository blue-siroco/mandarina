# MVP (Fase 1) — Decisiones

Decisiones tomadas en el grilling sobre `spec/roadmap.md` §1. Vocabulario en `CONTEXT.md`; decisiones de arquitectura en `docs/adr/`.

## Stack y entorno

- Frontend Angular 22 standalone, reutilizando `frontend/`, `docker-configs/frontend.Dockerfile`, el esqueleto de `docker-compose.yaml` y el `CLAUDE.md` de `../Angular-Boilerplate/` (tooling incluido: Vitest, Playwright, Stryker, ESLint, Testing Library). Se descartan `backend-api/` y los requirements de Python.
- Backend Node.js + TypeScript + Fastify (`@fastify/websocket`, validación por JSON Schema) con SQLite (`better-sqlite3`) — ADR-0001.
- Web **desktop-first**, adaptable a pantallas pequeñas.
- Desarrollo exclusivamente con Docker Compose desde el primer commit (`docker compose up` levanta backend, frontend con hot-reload y el volumen de SQLite).
- UI con los web components `@lucia/*` (tarballs versionados en `customWebComponent/`).
- Monousuario, local, sin autenticación; puertos publicados solo en `127.0.0.1`.
- Puertos: backend `4000` (HTTP y WebSocket en `/ws`, mismo puerto), frontend `4200`.

## Estructura del repo

```
frontend/                 Angular
backend/                  Node (ingesta HTTP + WS + SQLite)
adapters/claude-code/     send_event.mjs + rules.json
spec/                     roadmap, mvp, contratos
docker-configs/
docs/adr/
```

## Arquitectura interna

- Frontend: hexagonal (ports, casos de uso, adaptadores HTTP y WebSocket, mappers, composition root por feature), como recomienda el `CLAUDE.md` del boilerplate.
- Backend: ingesta → repositorio (interfaz; adaptador SQLite) → difusión WebSocket. Migrar a Postgres = escribir otro adaptador de repositorio.

## Tests

- TDD con Vitest en frontend y backend; tests de integración de la ingesta contra SQLite en memoria.
- Criterios de aceptación `AC-*` en `specs/ac/`.
- E2E con Playwright por rebanada.
- Adaptador probado con fixtures de payloads reales de Claude Code.

## Contratos

- Contract-first: REST en `spec/api-spec.yaml` (OpenAPI, mock con Prism). El mensaje del WebSocket se documenta como schema dentro del mismo OpenAPI (sin AsyncAPI).

## Captura

- Adaptador de Claude Code: script Node sin dependencias (`adapters/claude-code/send_event.mjs`) en la máquina del desarrollador.
- Hooks capturados: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `SessionEnd`.
- Tipos de evento normalizados — ADR-0002:

  | Hook nativo | Tipo de evento |
  |---|---|
  | `SessionStart` | `session.started` |
  | `UserPromptSubmit` | `prompt.submitted` |
  | `PreToolUse` | `tool.pre` |
  | `PostToolUse` | `tool.post` |
  | `PostToolUseFailure` | `tool.post` (ADR-0007) |
  | `SubagentStart` | `subagent.started` |
  | `SubagentStop` | `subagent.stopped` |
  | `Stop` | `turn.ended` |
  | `SessionEnd` | `session.ended` |
  | `Notification` | `session.notified` (ADR-0011) |
  | `PermissionRequest` | `permission.requested` (ADR-0011) |

- Best-effort: timeout ~1–2 s, descarta si el servidor no responde, sale siempre con 0 — ADR-0004.
- Sin flag `--add-chat`; el Transcript se lee bajo demanda desde `~/.claude` montado en solo lectura — ADR-0003.
- Instalación en el MVP: documentada (entrada en `.claude/settings.json`). Empaquetado como plugin de Claude Code: después del MVP.

## Evento normalizado

| Campo | Origen | Obligatorio |
|---|---|---|
| `id` | servidor | sí |
| `schema_version` | Adaptador | sí |
| `harness` | Adaptador | sí |
| `project` | Adaptador (config o nombre de carpeta raíz) | sí |
| `directory` | Adaptador | sí |
| `session_id` | Harness | sí |
| `subagent_id` | Harness | no |
| `event_type` | Adaptador (normalizado) | sí |
| `native_event_type` | Adaptador | sí |
| `tool_name` | Harness | no |
| `occurred_at` | Adaptador | sí |
| `received_at` | servidor | sí |
| `transcript_path` | Harness (ruta del host) | no |
| `payload` | Harness, enmascarado por el servidor | sí |
| `block` | Adaptador, solo en `tool.blocked`: `{ rule, reason }` (ADR-0006) | no |

El modelo no forma parte del Evento: se obtiene del Transcript.

## Persistencia y seguridad

- Enmascarado de secretos y PII en el Adaptador antes de enviar y otra vez en el servidor al ingerir, con marcadores con tipo — ADR-0009 (sustituye el enmascarado solo en el servidor con `***`). Dos copias del catálogo (Adaptador y backend) guardadas por unas mismas fixtures. También se enmascara lo que el servidor lee del Transcript.
- Avisos de inyección derivados al consultar de los `tool_response` de `WebFetch`, `WebSearch`, `Read`, las Herramientas MCP y los `Bash` con `curl`/`wget`, con severidad `high` / `medium` / `low`. Nunca bloquean; los descartes se guardan en SQLite. Pantalla `/seguridad` (grupo *Observar*) con las pestañas Avisos de inyección y Enmascarado. `GET /api/v1/injection-warnings`, `GET /api/v1/masking-stats`, `warnings` en los Eventos e `injection_alerts` en las Sesiones.
- Retención indefinida en el MVP.

## Sesiones

- Board agrupado Proyecto → Sesión; el Directorio es etiqueta y filtro de cada Sesión.
- Un Subagente pertenece a su Sesión; no es una Sesión aparte.
- Duración activa = suma de Turnos; se muestra junto a la Duración de reloj.
- Estados de la Sesión (umbrales configurables):
  - **Activa**: Evento en los últimos 5 min o Turno en curso.
  - **Inactiva**: sin Eventos > 5 min, sin `session.ended`.
  - **Huérfana**: sin `session.ended` y sin actividad > 30 min (ni Eventos ni mtime del Transcript).
  - **Cerrada**: llegó `session.ended` y no se ha retomado después (`--resume` reutiliza el `session_id`; AC-14).

## Bloqueo

- Reglas de bloqueo evaluadas en el hook local; el servidor solo registra el Bloqueo — ADR-0004.
- Configuración en `adapters/claude-code/rules.json`, con overrides opcionales por Proyecto.
- Reglas de serie:
  - `rm -rf` sobre `/`, `~` o rutas fuera del Directorio.
  - Lectura/escritura de `.env*`, `*.pem`, `id_rsa*`.
  - `git push --force` a `main`/`master`.
  - Comandos con secretos en claro (patrones de API keys).
- Edición de reglas desde la UI: Fase 2.

## Estado de los tests

- Una Ejecución de tests se deriva en el servidor, al consultar, de los `tool.post` de `Bash` cuyo comando lanza tests y cuya salida trae el resumen de un runner reconocido — ADR-0007. No hay Tipo de evento nuevo ni se guarda nada aparte.
- Runners reconocidos: Vitest, Jest y `node:test` (tests **unitarios**) y Playwright (tests **E2E**). Un comando que nombra `e2e` cuenta como E2E sea cual sea el runner.
- Un comando que falla (código de salida distinto de 0) llega por `PostToolUseFailure`, que el Adaptador envía también como `tool.post`: sin él no se verían los tests en rojo.
- Estado de los tests de un Proyecto = la última Ejecución de tests de cada Tipo de tests; si no hay ninguna en la ventana, "Sin datos".
- Ventana de 7 días, como los Bloqueos.
- Leer reportes de los runners (JSON, JUnit XML) del disco del Proyecto: fuera del MVP (el backend corre en Docker y no ve los Directorios).

## Uso de skills

- Una Invocación de skill se deriva en el servidor, al consultar, igual que las Ejecuciones de tests (ADR-0007): de los `tool.pre`/`tool.post` de la herramienta `Skill` y de los `prompt.submitted` que empiezan por `/nombre` (sin otra `/` en el nombre). No hay Tipo de evento nuevo, no cambia el Adaptador y no se guarda nada aparte.
- También se leen los `tool_use` de `Skill` de los Transcripts (principal y de cada Subagente) de las Sesiones del periodo, y se unen con los Eventos por `tool_use_id`: los hooks no siempre las envían (Subagentes, tramos sin hook). Una que solo consta en el Transcript lleva `event_id: null`.
- Quién la invocó: **agente** (herramienta `Skill` de la Sesión principal), **Subagente** (herramienta `Skill` con `subagent_id`, o en el Transcript del Subagente) o **persona usuaria** (`/nombre`). Una `/nombre` no genera Evento `Skill` en Claude Code, así que no hay duplicados que fusionar.
- Estado: **en curso** hasta el `turn.ended` del Turno en que se cargó (o el `subagent.stopped` de su Subagente); **terminada** después, con esa duración; **fallida** si el `tool.post` trae `payload.error` o `tool_response.success: false`. Si la Sesión queda Cerrada o Huérfana sin cerrar el Turno, queda terminada sin duración.
- La skill no devuelve respuesta propia: en lugar de una respuesta resumida, cada invocación enlaza a su Turno.
- Solo se ven las skills usadas; las que nunca se disparan necesitan el catálogo (Fase 2.1).
- Pantalla `/skills` con el selector de periodo del board (1 h / 24 h / 7 d / todo), por defecto 7 d.

## Subagentes

- El ciclo de vida de cada Subagente se deriva en el servidor al consultar, de los Eventos de la Sesión (y del Transcript si está): lanzamiento (`tool.pre` de `Agent`/`Task`), `subagent.started`, sus Eventos propios, `subagent.stopped` y el `tool.post` de `Agent`. Sin Tipo de evento nuevo ni cambios en el Adaptador.
- Enlace lanzamiento ↔ Subagente: exacto por `agent-<id>.meta.json` (`toolUseId`) o por `tool_response.agentId` del `tool.post`; si aún no hay exacto, un Subagente con Tipo se empareja con el lanzamiento sin enlazar más antiguo de su Sesión con ese Tipo y lanzado antes que él. Un lanzamiento sin enlazar es un Subagente pendiente, sin `subagent_id`.
- Fin: `subagent.stopped`; si falta, el `tool.post` síncrono del lanzamiento (no el `async_launched` de los que van en segundo plano). La respuesta sale de `subagent.stopped` o del Transcript.
- Subagente interno: solo tiene `subagent.stopped`, con `agent_type` vacío y sin lanzamiento enlazado. No cuenta en el board ni en las métricas; en las listas se oculta salvo con `include_internal` / "Mostrar internos".
- Cada Evento `subagent.*` lleva un campo derivado `subagent` (Tipo, descripción de la Tarea, duración, interno) en `GET /events` y en el WebSocket, para resumirlo sin buscar su lanzamiento.
- Pantalla `/subagentes` con el periodo del board (por defecto 24 h): los tokens se leen de los Transcripts de las Sesiones del periodo.

## Desglose de las fichas

- Las fichas del board siguen su periodo y su filtro de Directorio: `/api/v1/metrics` acepta `directory`.
- El desglose se pide solo con el modal abierto (`breakdown=true`): `breakdown.by_directory` y `breakdown.by_model`, cada fila con las mismas cifras que el total (Sesiones trabajando / en pausa / Huérfanas, Subagentes en marcha, herramientas, prompts, Bloqueos, tokens y Coste estimado).
- Por modelo, los tokens y el coste son exactos, respuesta a respuesta. Los conteos van al modelo en uso: una Sesión o un Subagente, al de su última respuesta; una herramienta, un prompt o un Bloqueo, al de la respuesta anterior de su Sesión o Subagente (o la siguiente si no había ninguna). Sin modelo conocido: fila "Modelo desconocido" (`model: null`). La suma de filas coincide con el total.
- Por Directorio, una fila por Directorio con actividad en el periodo, con su Proyecto, su modelo principal (el de más tokens de salida) y sus Transcripts no disponibles.
- La vista del modal (Por Directorio / Por modelo) se recuerda en `localStorage`; el modal no va en la URL.

## Servidores MCP

- Una invocación de Herramienta MCP se deriva al consultar de los `tool.pre` / `tool.post` / `tool.blocked` cuyo `tool_name` empieza por `mcp__` y de `ListMcpResourcesTool` / `ReadMcpResourceTool` (servidor en `tool_input.server`), como las Ejecuciones de tests (ADR-0007). Sin Tipo de evento nuevo ni cambios en el Adaptador.
- Servidor y ámbito: `mcp_server.name` y `mcp_server.source` del `tool.pre`; si faltan, el servidor es lo que va entre `mcp__` y el último `__` del `tool_name`, y el ámbito es desconocido. Un Servidor MCP se identifica solo por su nombre.
- Estados: `ok`, `error`, `interrupted` (`is_interrupt: true`), `blocked`, `running`, `no_response`. El % de fallos es `error / (ok + error)`: ni las interrumpidas ni las bloqueadas cuentan.
- Latencia: `duration_ms` del `tool.post`, o `tool.post − tool.pre`. Tamaño: bytes del JSON de `tool_response`; `has_image` si trae un bloque `type: image`. Las respuestas se guardan completas, sin recortar.
- Herramientas diferidas no usadas: `tool_response.matches` de `ToolSearch` que empiezan por `mcp__` y no tienen `tool.pre` en la Sesión.
- Pantalla `/mcp` con el periodo del board, por defecto 7 d.

## Agentes

- El perfil de cada Tipo de Subagente se deriva al consultar del ciclo de vida del 1.7 (AC-33) y de lo que ya leen las rebanadas 5, 6 y 9 (Ejecuciones de tests, Invocaciones de skill e invocaciones MCP con `subagent_id`). Sin Tipo de evento nuevo ni cambios en el Adaptador.
- Estado de un Lanzamiento: `running`, `finished` o `no_response` (sin fin en una Sesión Cerrada o Huérfana). `GET /api/v1/subagents` usa los mismos tres estados. Las herramientas con error y los Bloqueos son contadores, no estados.
- Lanzador: el agente principal, o el `agent_type` de los Eventos del agente principal si lo traen. En Claude Code un Subagente no lanza Subagentes; si llegara un `tool.pre` de `Agent` con `subagent_id`, se cuenta como lanzado por ese Tipo.
- Pantalla `/agentes` con el periodo del board, por defecto 7 d. `/subagentes` pierde la tabla por Tipo y `GET /api/v1/subagents` su `stats`.
- Los Lanzamientos por día se agrupan en el navegador, por día local, a partir de la hora de cada Lanzamiento.

## Exportación OTLP

- Opt-in con las variables estándar de OpenTelemetry; el contenido va con un segundo opt-in (`MANDARINA_OTLP_INCLUDE_CONTENT`) y enmascarado — ADR-0008.
- Una traza por Turno, exportada al terminar el Turno o al quedar su Sesión Cerrada o Huérfana. Spans OpenInference: `AGENT` (Turno y Subagentes), `LLM` (respuestas del Transcript) y `TOOL` (invocaciones y Bloqueos).
- OTLP/HTTP con JSON escrito a mano, sin el SDK. Estado por Turno en SQLite (`pending`, `exported`, `failed`), 3 reintentos con espera creciente.
- `GET /api/v1/exporter` con el estado del exportador; indicador "Exportando a `<host>`" en la barra lateral.

## Evaluación humana

- Una Evaluación por objeto (Sesión, Turno o Subagente) con Puntuación binaria (`1`, `-1` o `null`), Etiquetas y Nota. El Turno se identifica por el id de su `prompt.submitted`.
- Tabla propia en SQLite, fuera de la ingesta: las Evaluaciones no son Eventos. Sin difusión por WebSocket (monousuario).
- Etiquetas normalizadas a minúsculas con guiones; sugerencias de serie `bug-fix`, `hallucination`, `prompt-breakdown`, `refactor`.
- Dataset de evaluación en JSONL con el prompt y la respuesta final (la del hook `Stop` o `SubagentStop`), enmascarados; solo el modelo se lee del Transcript.
- Pantalla `/evaluaciones` (grupo *Observar*); controles en la cabecera del detalle, en cada Turno de la *Línea de tiempo* y en cada Subagente.

## Caché de prompts

- Tasa de acierto = `cache_read / (input + cache_read + cache_creation)`.
- Ahorro neto = `cache_read × (entrada − lectura de caché)` − `cache_creation_5m × entrada × 0,25` − `cache_creation_1h × entrada × 1`, por modelo con su Tarifa (ADR-0005). Puede ser negativo.
- Reescritura de caché: una respuesta, no la primera de su Sesión o Subagente, cuya escritura en caché supera la mitad de sus tokens de entrada. Causa: `expired` (hueco mayor que el TTL de su clase de escritura), `model_change`, `compaction` u `other`.
- Ficha Caché con el modal del 1.8; `cache` en `/api/v1/metrics`, en cada fila de `breakdown` y en el detalle de Sesión, más `cache_rewrites` en el detalle. Sin reducción de latencia: no se puede medir.

## Presupuestos

- Ámbitos `session` (de todos los Proyectos o de uno), `project_day` y `global_day`, con el día natural según `TZ`. Umbral de aviso (por defecto 80 %) y acción `warn` o `stop` (por defecto `stop`). Estados `within`, `near` y `exceeded`.
- El hook consulta `GET /api/v1/budgets/status` tras las Reglas de bloqueo locales, con 500 ms de timeout y fallo abierto; al superarse, `continue: false` en `PreToolUse` y `decision: "block"` en `UserPromptSubmit`, registrados como `tool.blocked` con regla `budget` — ADR-0010.
- Presupuestos y excepciones ("permitir esta Sesión" o "este Proyecto hasta fin del día") en SQLite, editables en `/presupuestos` (grupo nuevo *Configurar*). Cambios de estado difundidos por WebSocket; aviso en la cabecera con sonido Web Audio silenciable.

## Orden de entrega (rebanadas verticales)

1. Esquema de Evento + hook + ingesta HTTP + SQLite + WebSocket + lista cruda de Eventos en la UI (tabla HTML semántica; `@lucia/*` entra con el board de la rebanada 2). **Hecha.**
1b. Fichas de uso del periodo del board (inicialmente del día): Actividad de la Sesión (Trabajando / En pausa), Subagentes en marcha, Huérfanas, actividad, Uso de tokens y Coste estimado leídos de los Transcripts — AC-11, AC-12, AC-13; ADR-0005. **Hecha.**
2. Board de Sesiones, filtros y Estados de la Sesión; lista de Eventos filtrable y expandible en `/eventos` — AC-14 a AC-17. **Hecha.**
3. Panel de detalle de Sesión (modelo, tokens, % contexto, línea de tiempo, prompts, duraciones) — AC-18, AC-19. **Hecha.**
3b. Tarea y actividad de cada Subagente (detalle y board) y orden estable del board — AC-15, AC-16, AC-23, AC-24.
4. Reglas de bloqueo y visualización de Bloqueos — AC-20 a AC-22; ADR-0006. **Hecha.**
5. Visor del Estado de los tests (unitarios y E2E) por Proyecto, en `/tests` — AC-25 a AC-28; ADR-0007. **Hecha.**
6. Uso de skills: Invocaciones de skill en la pestaña *Skills* del detalle de Sesión y pantalla agregada en `/skills` — AC-29 a AC-32. **Hecha.**
7. Visibilidad completa de los Subagentes: inicio por lanzamiento, Eventos legibles, Subagentes internos y pantalla `/subagentes` con el agregado por Tipo de Subagente — AC-33 a AC-37. **Hecha.**
8. Desglose por Directorio y por modelo de las fichas del board, que pasan a seguir el filtro de Directorio — AC-38 a AC-40. **Hecha.**
9. Observador de servidores MCP: invocaciones con estado, latencia y tamaño; pantalla `/mcp`, pestaña MCP del detalle y categoría MCP en Eventos — AC-41 a AC-44. **Hecha.**
10. Observador de agentes: comparativa de Tipos de Subagente en `/agentes` y perfil por Tipo en `/agentes/<tipo>`; `/subagentes` queda como lista — AC-45 a AC-48. **Hecha.**
11. Exportación OTLP opt-in de cada Turno con OpenInference e indicador del exportador — AC-49 a AC-53; ADR-0008. **Hecha.**
12. Evaluación humana de Sesiones, Turnos y Subagentes; pantalla `/evaluaciones` y Dataset de evaluación en JSONL — AC-54 a AC-59. **Hecha.**
13. Enmascarado de secretos y PII en el Adaptador y en el servidor con marcadores con tipo (sustituye AC-06); Avisos de inyección y pantalla `/seguridad` — AC-60 a AC-68; ADR-0009. **Hecha.**
14. Eficiencia de la caché de prompts: ficha Caché con su desglose, tasa y ahorro en el detalle y en el perfil de agente, y Reescrituras de caché en la *Línea de tiempo* — AC-69 a AC-75. **Hecha.**
15. Presupuestos con aviso en la UI y parada del agente desde el hook; pantalla `/presupuestos` — AC-76 a AC-84; ADR-0010. **Hecha.**
16. Alerta visual y sonora cuando una Sesión espera a la persona usuaria: Tipos de evento `session.notified` y `permission.requested`, Actividad *Esperando* (permiso, pregunta o inactividad), aviso en la cabecera, contador en el título, favicon y sonido — AC-85 a AC-99; ADR-0011. **Hecha.**

Fuera del alcance entregado (quedan en `spec/design.md` para más adelante): árbol Proyectos → Sesiones en la barra lateral, búsqueda global `Ctrl/⌘ K`, plegado manual de la barra lateral, vista de tabla del board, zoom y tooltip enlazado de los carriles, scroll virtual y "N Eventos nuevos", rango de fechas con calendario y búsqueda en el payload.
