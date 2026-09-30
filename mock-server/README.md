# Mock de Eventos

Herramientas para probar Mandarina **sin Claude Code** y, si hace falta, **sin backend**. Ambas generan Sesiones de Claude Code simuladas y realistas:
- varios Proyectos y Directorios, con Sesiones concurrentes entrelazadas;
- Turnos con prompt, pares `PreToolUse`/`PostToolUse` y `Stop`;
- Subagentes con sus propios Eventos;
- Ejecuciones de tests (`npm test` con salida de Vitest, `npx playwright test`) en verde y en rojo; las rojas llegan por `PostToolUseFailure` (ADR-0007);
- Invocaciones de skill: herramienta `Skill` (también desde Subagentes) y prompts `/nombre` (AC-29);
- Herramientas del Servidor MCP `playwright` (con `mcp_server`, `duration_ms`, capturas con imagen, fallos e interrupciones) y búsquedas `ToolSearch` (AC-41);
- comparativa y perfil de cada Tipo de Subagente (`/api/v1/agents`, AC-46);
- estado de una Exportación OTLP activa, con Turnos exportados, pendientes y fallidos (`/api/v1/exporter`, AC-52);
- Evaluaciones humanas en memoria (`/api/v1/evaluations`, AC-54 a AC-56), con la Puntuación en las Sesiones y en la comparativa de agentes (AC-59);
- Avisos de inyección de páginas web con contenido hostil (`/api/v1/injection-warnings`, con descarte, y `warnings` en los Eventos, AC-63 y AC-64) y estadísticas de Enmascarado sintéticas (`/api/v1/masking-stats`, AC-65);
- eficiencia de la caché de prompts (`cache` en las métricas y su desglose, en el detalle de Sesión con sus Reescrituras y por Lanzamiento y Tipo de Subagente, AC-69 a AC-73), con las mismas fórmulas del backend sobre los tokens sintéticos;
- Presupuestos en memoria (`/api/v1/budgets`, sus excepciones y `/api/v1/budgets/status` para el hook) con `budget.state` por el WebSocket ante cada transición (AC-76 a AC-81). El gasto es sintético y de céntimos: para ver un aviso crea un Presupuesto de un céntimo;
- Sesiones **Esperando** (ADR-0011, AC-93): `PermissionRequest`, `Notification` (permiso e inactividad) y preguntas abiertas con `AskUserQuestion`, con `activity = "waiting"` y `waiting` en la lista y el detalle de Sesión y `sessions.waiting` en las métricas, con las mismas reglas que el backend (`lib/mock-waiting.mjs`);
- ~10 % de Sesiones Huérfanas, que terminan sin `SessionEnd`.

Los payloads se generan en formato **nativo de Claude Code** y pasan por el normalizador real del Adaptador (`adapters/claude-code/lib/normalize.mjs`), así que el mock también ejercita el mapeo hook → Evento.

| Modo | Para qué | Qué sustituye |
|---|---|---|
| `serve` | Probar el **frontend** sin backend | El backend: API `/api/v1` + WebSocket `/ws` en memoria, con historial precargado y Eventos en vivo |
| `send` | Probar el **backend** (y el frontend conectado a él) sin Claude Code | Claude Code + hook: envía Eventos al backend real por `POST /api/v1/events`, incluidos algunos secretos para ver el enmascarado |

## Con Docker (recomendado)

```bash
# Frontend contra el mock (sin backend). Abre http://localhost:4200
API_TARGET=http://mock-api:4000 docker compose --profile mock up mock-api frontend

# Backend + frontend reales, alimentados por el simulador
docker compose --profile simulate up
```

En PowerShell, fija la variable antes: `$env:API_TARGET='http://mock-api:4000'`.

El mock también queda publicado en `http://127.0.0.1:4001` (`MOCK_PORT`) para probarlo con `curl`.

## Sesiones que esperan

- `serve` arranca con tres Sesiones semilla ya esperando (Eventos de los últimos ~2 minutos; después siguen Esperando, pasan a Inactivas a los 5 min y a Huérfanas, sin espera, a los 30):

  | Sesión (`session_id`) | Espera |
  |---|---|
  | `seed-espera-permiso-0001` | permiso para `Bash` (`npm install --save-dev vitest`) |
  | `seed-espera-pregunta-0002` | pregunta abierta de `AskUserQuestion` |
  | `seed-espera-subagente-0003` | permiso para `Write` pedido por el Subagente `agent-5eed01` (`Plan`) |

- El simulador (`serve` en vivo y `send`) intercala esperas al azar: un `PermissionRequest` tras un `PreToolUse` (a veces con su `Notification` `permission_prompt`), una notificación `idle_prompt` y una pregunta `AskUserQuestion`. La espera termina con el siguiente Evento (`tool.post`, `prompt.submitted`, `turn.ended`…). Las esperas no alteran las Sesiones que genera cada `--seed`: solo añaden Eventos.
- Para forzar una a mano contra `serve`: `POST /api/v1/events` con `event_type = permission.requested` (o `session.notified`) y, para terminarla, un `tool.post` del mismo carril.
- La UI las ve por `/ws` como `event.ingested` y por `GET /api/v1/sessions`.

## Uso de la suscripción

`GET` y `PUT /api/v1/subscription-usage` imitan la ficha *Uso de la suscripción* (ADR-0012, AC-132). `serve` arranca con una cuenta de suscripción: la ventana de 5 h cerca del límite y la semanal holgada. Con `--no-subscription` devuelve `{ "usage": null }` y la ficha no aparece. Un `PUT` válido (204) sustituye la lectura y difunde `{ "type": "subscription.usage", "usage": … }` por `/ws`; sin ventanas, con un porcentaje fuera de 0..100 o con campos desconocidos responde 400. `send` manda una lectura al empezar y otra cada cinco Eventos, con la ventana de 5 h gastándose poco a poco.

`GET /api/v1/metrics` ya no trae `tool_calls`, `prompts` ni `blocks` (AC-133): `activity` solo cuenta Eventos.

## Descargas de Sesión y de Eventos

`GET /api/v1/sessions/{id}/export` (JSON) y `GET /api/v1/events/export` (JSONL, `application/x-ndjson`) con sus `.../preview`, como el backend (ADR-0013, AC-142 a AC-146). Solo lectura, orden cronológico ascendente, tope de 50 000 Eventos (los más recientes; `truncated`/`omitted` en la cabecera `export`) y `content=true` opt-in. Los filtros de Eventos son `project`, `session_id`, `event_type` y `tool` (repetibles) y `since`. `content` o filtros inválidos responden 400 y una Sesión inexistente 404. Con `content=true` el mock pasa `payload`, `block.reason` y el detalle de la Sesión por el enmascarado del Adaptador (`adapters/claude-code/lib/mask.mjs`). No lee Transcripts: los tokens, la Tarea y la respuesta de los Subagentes son los sintéticos de siempre.

## Opciones

```bash
node cli.mjs serve [--port 4000] [--interval 1500] [--history 40] [--seed 1]
node cli.mjs send  [--target http://127.0.0.1:4000] [--count 0] [--interval 1000] [--seed N]
```

| Opción | Modo | Por defecto | Significado |
|---|---|---|---|
| `--interval` | ambos | 1500 / 1000 ms (`MOCK_INTERVAL_MS`) | Pausa entre Eventos; `0` = lo más rápido posible (`send`) o sin Eventos en vivo (`serve`) |
| `--history` | `serve` | 40 | Eventos precargados al arrancar |
| `--count` | `send` | 0 (sin fin) | Eventos a enviar; con un número, termina y sale con 1 si alguno fue rechazado o falló |
| `--seed` | ambos | 1 / aleatoria | Misma semilla, mismas Sesiones |
| `--no-subscription` | ambos | (desactivada) | `serve`: arranca sin datos de suscripción (`usage: null`, como una cuenta con API key). `send`: no envía lecturas del uso de la suscripción |
| `--target` | `send` | `http://127.0.0.1:4000` (`MOCK_TARGET`) | Backend al que se envía |

Ejemplo de prueba de carga rápida contra el backend: `docker compose --profile simulate run --rm event-simulator node cli.mjs send --count 1000 --interval 0`.

## Qué no hace el mock (`serve`)

No persiste, no enmascara al ingerir (sus Eventos no llevan secretos; solo enmascara las descargas con `content=true`) y valida el contrato solo de forma básica. `GET /api/v1/metrics` calcula la actividad a partir de sus Eventos, pero no tiene Transcripts: el Uso de tokens y el Coste estimado son sintéticos (deterministas por Evento, con el modelo del `SessionStart`). Lo mismo pasa con la Tarea y la respuesta de cada Subagente: salen de una plantilla por tipo (`Explore`, `Plan`, `general-purpose`), mientras que sus herramientas son las de sus Eventos simulados. Para esos comportamientos, usa el backend real con `send`.

## Tests

```bash
docker compose run --rm --no-deps mock-api npm test
```
