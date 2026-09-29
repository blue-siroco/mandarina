# Mandarina

Observabilidad de agentes de código: Claude Code primero, otros Harness después. Captura los hooks, los persiste y los muestra en vivo en un dashboard web (escritorio primero, adaptable a pantallas pequeñas).

- Qué se construye y en qué orden: [`spec/roadmap.md`](spec/roadmap.md) y [`spec/mvp-fase1.md`](spec/mvp-fase1.md).
- Vocabulario del dominio: [`CONTEXT.md`](CONTEXT.md). Decisiones de arquitectura: [`docs/adr/`](docs/adr/).
- Contrato de la API: [`spec/api-spec.yaml`](spec/api-spec.yaml). Criterios de aceptación: [`specs/ac/`](specs/ac/).

```
hook (tu máquina) → HTTP POST → backend (Docker) → SQLite → WebSocket → dashboard
```

## Qué muestra

El grupo *Observar* de la barra lateral va de lo más general a lo más detallado:

| Pantalla | Qué ves |
|---|---|
| **Board** (`/sesiones`) | Sesiones en vivo por Estado, con tokens, coste y actividad; el detalle de cada Sesión reparte sus Eventos, Subagentes, skills y llamadas MCP en pestañas |
| **Agentes** (`/agentes`) | Comparativa por Tipo de Subagente (Lanzamientos, duración, coste, errores) y el perfil de cada Tipo |
| **Subagentes** (`/subagentes`) | Cada Lanzamiento de todas las Sesiones, con su Estado, duración y coste |
| **Skills** (`/skills`) | Skills invocadas por la persona usuaria (`/nombre`), por el agente o por un Subagente |
| **MCP** (`/mcp`) | Llamadas a Herramientas MCP por Servidor MCP, con estado, latencia y tamaño de la respuesta |
| **Tests** (`/tests`) | Ejecuciones de tests detectadas en los comandos de la Sesión y su resultado |
| **Bloqueos** (`/bloqueos`) | Acciones que el hook impidió por una Regla de bloqueo |
| **Seguridad** (`/seguridad`) | Avisos de inyección (contenido leído que parece dar órdenes al agente, con descarte de falsos positivos) y los secretos y datos personales enmascarados por Proyecto |
| **Evaluaciones** (`/evaluaciones`) | Tu Puntuación, Etiquetas y Notas sobre Sesiones, Turnos y Subagentes, y su exportación en JSONL como dataset de evals |
| **Eventos** (`/eventos`) | Lista cruda de Eventos, en vivo |

El grupo *Configurar* tiene **Presupuestos** (`/presupuestos`): límites de Coste estimado por Sesión, por Proyecto y día o globales del día, con aviso en la cabecera y, si lo eliges, parada del agente desde el hook (ADR-0010). El board suma la ficha **Caché** (tasa de acierto y ahorro neto) y la barra lateral avisa cuando se están exportando trazas OTLP (ver más abajo).

Parte de los datos no viaja en los hooks: tokens, coste, modelo, Subagentes y skills se completan leyendo los Transcripts de `~/.claude` al consultar.

## Stack

| Componente | Tecnología | Puerto local |
|---|---|---|
| `frontend/` | Angular 22 standalone | `127.0.0.1:4200` (`FRONTEND_PORT`) |
| `backend/` | Node.js + TypeScript + Fastify + SQLite (`better-sqlite3`) | `127.0.0.1:4000` (`BACKEND_PORT`), WebSocket en `/ws` |
| `adapters/claude-code/` | Script Node sin dependencias, corre en tu máquina | — |
| `mock-server/` | Mock de la API + WebSocket y simulador de Sesiones ([detalles](mock-server/README.md)) | `127.0.0.1:4001` (`MOCK_PORT`) |
| `spec/api-spec.yaml` | OpenAPI; mock estático con Prism (`--profile prism`) | `127.0.0.1:4010` |

## Arranque

Todo el desarrollo corre en Docker; no hace falta Node ni Angular en el host (salvo Node para el hook de Claude Code).

```bash
docker compose up                        # backend + frontend con hot-reload
FRONTEND_PORT=4201 docker compose up     # si el 4200 está ocupado
```

Abre `http://localhost:4200` (o el `FRONTEND_PORT` que hayas elegido) y [instala el hook](#instalar-el-hook-de-claude-code) en el proyecto que quieras observar.

La base de datos vive en el volumen `mandarina-data`. El backend monta `~/.claude` en solo lectura para leer los Transcripts (ADR-0003); cambia la ruta con `CLAUDE_HOME`.

## Exportar las trazas a un colector OTLP

Opcional y apagado por defecto (ADR-0008). Cada Turno terminado se envía como una traza OpenTelemetry con la convención OpenInference, en OTLP/HTTP con JSON, a Jaeger, Grafana Tempo, Datadog, Langfuse o Arize Phoenix. Se activa con las variables estándar, por ejemplo en un `.env` junto a `docker-compose.yaml`:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318          # se le añade /v1/traces
# OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://…/v1/traces              # o la URL completa de trazas
OTEL_EXPORTER_OTLP_HEADERS=authorization=Basic%20abc123               # clave=valor, separadas por comas
MANDARINA_OTLP_INCLUDE_CONTENT=false                                  # true: también prompts y entradas/salidas de herramientas
```

Sin `MANDARINA_OTLP_INCLUDE_CONTENT=true` solo salen estructura, tiempos, tokens, coste, modelo y nombres de herramienta. El contenido sale siempre enmascarado. La barra lateral avisa de que se está exportando y de los Turnos que han fallado. Solo se exportan los Turnos que terminan después de activar el exportador.

## Probar sin Claude Code: mock de Eventos

`mock-server/` genera Sesiones de Claude Code simuladas (varios Proyectos, Turnos, herramientas, Subagentes y Sesiones Huérfanas) para probar la app antes de conectarla a un entorno real:

```bash
# Solo frontend, contra un mock de la API y del WebSocket (sin backend)
API_TARGET=http://mock-api:4000 docker compose --profile mock up mock-api frontend

# Backend + frontend reales, alimentados con Eventos simulados (incluye secretos para ver el enmascarado)
docker compose --profile simulate up
```

En PowerShell: `$env:API_TARGET='http://mock-api:4000'` antes del primer comando. Opciones (ritmo, cantidad, semilla…) en [`mock-server/README.md`](mock-server/README.md).

## Instalar el hook de Claude Code

El hook es el script `adapters/claude-code/send_event.mjs`. Claude Code lo ejecuta **en tu máquina** (no en Docker) cada vez que ocurre un hook y envía el Evento al backend de Mandarina. Si Mandarina está apagado, el hook descarta el Evento en silencio y Claude Code sigue funcionando con normalidad.

> **El hook también bloquea.** Antes de cada herramienta aplica en local unas Reglas de bloqueo (`rm` peligrosos, `push --force` a `main`, ficheros sensibles, secretos en comandos), aunque Mandarina esté apagado. Se activan o desactivan, también por Proyecto, en `adapters/claude-code/rules.json` ([detalles](adapters/claude-code/README.md)).

### 1. Requisitos

- **Node ≥ 20** en el host (`node --version`). El script no tiene dependencias: no hace falta `npm install`.
- Mandarina levantado (`docker compose up`). Compruébalo con `curl http://127.0.0.1:4000/api/v1/health`, que debe responder `{"status":"ok"}`.

### 2. Registrar el hook

Elige dónde registrarlo:

| Fichero | Alcance |
|---|---|
| `<proyecto>/.claude/settings.json` | Solo ese proyecto (compartido con el equipo si se versiona) |
| `<proyecto>/.claude/settings.local.json` | Solo ese proyecto y solo para ti (no se versiona) |
| `~/.claude/settings.json` | Todos tus proyectos |

Añade (o fusiona con tu bloque `hooks` existente) lo siguiente, sustituyendo `<MANDARINA>` por la **ruta absoluta** de este repo. En Windows usa `/` en lugar de `\`, p. ej. `C:/Users/yo/Codev/mandarina`:

```json
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "node <MANDARINA>/adapters/claude-code/send_event.mjs" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node <MANDARINA>/adapters/claude-code/send_event.mjs" }] }],
    "PreToolUse":       [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node <MANDARINA>/adapters/claude-code/send_event.mjs" }] }],
    "PostToolUse":      [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node <MANDARINA>/adapters/claude-code/send_event.mjs" }] }],
    "PostToolUseFailure": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node <MANDARINA>/adapters/claude-code/send_event.mjs" }] }],
    "SubagentStart":    [{ "hooks": [{ "type": "command", "command": "node <MANDARINA>/adapters/claude-code/send_event.mjs" }] }],
    "SubagentStop":     [{ "hooks": [{ "type": "command", "command": "node <MANDARINA>/adapters/claude-code/send_event.mjs" }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "node <MANDARINA>/adapters/claude-code/send_event.mjs" }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "node <MANDARINA>/adapters/claude-code/send_event.mjs" }] }]
  }
}
```

Reinicia Claude Code (o ábrelo de nuevo en ese proyecto) para que cargue los hooks. Puedes revisar que están registrados con `/hooks` dentro de Claude Code.

### 3. Configuración opcional

El hook lee estas variables de entorno. Puedes fijarlas por proyecto con la clave `env` del mismo `settings.json`:

```json
{
  "env": {
    "MANDARINA_PROJECT": "mi-proyecto",
    "MANDARINA_URL": "http://127.0.0.1:4000"
  }
}
```

| Variable | Por defecto | Uso |
|---|---|---|
| `MANDARINA_PROJECT` | Nombre de la carpeta raíz del proyecto | Nombre con el que aparece el Proyecto en Mandarina |
| `MANDARINA_URL` | `http://127.0.0.1:4000` | Backend de Mandarina; cámbialo si arrancaste con otro `BACKEND_PORT` |
| `MANDARINA_RULES` | `rules.json` junto a `send_event.mjs` | Fichero de configuración de las Reglas de bloqueo |
| `MANDARINA_DEBUG` | — | Si tiene valor, los errores de envío y de las reglas se escriben en stderr |

### 4. Comprobar que funciona

1. Abre el dashboard (`http://localhost:4200`); el indicador debe decir **En vivo**.
2. Envía cualquier prompt en Claude Code dentro del proyecto: deberían aparecer al instante Eventos como *Prompt*, *Herramienta (antes/después)* y *Fin de turno*.

Si no aparece nada:

- Comprueba que el backend responde (`curl http://127.0.0.1:4000/api/v1/health`).
- Prueba el hook a mano con un payload de ejemplo y el modo depuración:

  ```bash
  MANDARINA_DEBUG=1 node <MANDARINA>/adapters/claude-code/send_event.mjs \
    < <MANDARINA>/adapters/claude-code/test/fixtures/PreToolUse.json
  ```

  En PowerShell: `$env:MANDARINA_DEBUG=1; Get-Content <MANDARINA>/adapters/claude-code/test/fixtures/PreToolUse.json | node <MANDARINA>/adapters/claude-code/send_event.mjs`

  Si no imprime ningún error, el Evento aparecerá en el dashboard con el Proyecto `demo`.
- Revisa que la ruta de `<MANDARINA>` sea absoluta y que `node` esté en el `PATH` del entorno donde corre Claude Code.

### Desinstalar

Borra el bloque `hooks` (o solo las entradas de `send_event.mjs`) del `settings.json` donde lo añadiste.

Más detalles del Adaptador en [`adapters/claude-code/README.md`](adapters/claude-code/README.md).

## Tests

```bash
docker compose run --rm --no-deps backend  npm test
docker compose run --rm --no-deps backend  npm run typecheck
docker compose run --rm --no-deps frontend npx vitest run
docker compose run --rm --no-deps frontend npx eslint .
docker compose run --rm --no-deps frontend npm run build
# E2E contra el frontend levantado, con la imagen oficial de Playwright:
docker run --rm --network mandarina-development_mandarina-net \
  -v "$PWD/frontend:/work" -v mandarina-development_frontend-node-modules:/work/node_modules \
  -w /work -e E2E_BASE_URL=http://frontend:4200 \
  mcr.microsoft.com/playwright:v1.63.0-noble npx playwright test
docker compose run --rm --no-deps mock-api npm test
# Adaptador (en el host):
cd adapters/claude-code && npm test
```

## Convenciones

- **Idioma**: código e identificadores en inglés; comentarios, documentación y mensajes al usuario en español.
- **Commits**: `[TIPO(alcance)]: descripción breve` con tipo en mayúsculas (`FEAT`, `FIX`, `TEST`, `STYLE`, `REFACTOR`, `PERF`, `DOC`, `BUILD`, `CHORE`).
