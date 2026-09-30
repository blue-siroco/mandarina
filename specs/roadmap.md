# Claude Code Observer / Orquestador — Especificación y Roadmap

Documento de referencia para construir una aplicación de observabilidad, gestión y orquestación de agentes y skills de Claude Code, basado en proyectos reales existentes en GitHub (disler/claude-code-hooks-multi-agent-observability, Dicklesworthstone/claude_code_agent_farm, stevTresCloud/claude-activity-viewer, nexus-labs-automation/agent-observability, SamGreenDev/claude-code-environment, LeeJuOh/claude-code-zero, entre otros).

---

## 0. Decisión de arquitectura clave

Un dato relevante: **claude-activity-viewer** empezó como orquestador (MCP server que lanzaba, esperaba y cancelaba agentes) y en v0.3 lo abandonó porque Claude Code ya orquesta nativamente vía Agent Teams. Se quedaron solo con la observabilidad como "valor duradero".

**Recomendación:** diseña la app en dos capas desacopladas:

- **Capa de observación** (siempre útil, agnóstica de cómo se orquesta): lee hooks y transcripts.
- **Capa de orquestación** (opcional, de mayor riesgo/mantenimiento): lanza y controla agentes directamente.

Esto te permite lanzar un MVP sólido de observabilidad rápido, y añadir orquestación activa después solo si de verdad aporta sobre lo nativo.

---

## 0.5 Requisito transversal: soporte multimodelo / multi-harness

Este es un requisito que **atraviesa todas las fases**, no una fase aparte — afecta al diseño del esquema de datos desde el día 1. La idea: no observar/orquestar solo Claude Code, sino cualquier harness de agentes (Codex CLI, OpenCode, Cursor, Gemini CLI, etc.), y dentro de Claude Code, no limitarte a un solo modelo.

Dos niveles de "multimodelo" a distinguir:

**a) Multi-modelo dentro de Claude Code**

- Registrar qué modelo se usó por sesión/subagente (Sonnet, Opus, Haiku, Fable, Mythos...), ya que Claude Code permite cambiar de modelo a mitad de conversación.
- Comparativas de coste/latencia/tokens **por modelo**, no solo por sesión — para poder responder "¿me sale mejor Opus u Haiku para esta tarea repetitiva?".

**b) Multi-harness (más allá de Claude Code)**

- **Esquema de eventos normalizado (harness-agnóstico):** define un formato interno propio (`source_app`, `harness_type`, `session_id`, `event_type`, `payload`) y luego un **adaptador** por cada harness que traduce sus hooks nativos a ese formato común. Así el dashboard, la base de datos y el WebSocket no cambian aunque cambie el harness.
- **Adaptadores de captura por harness:** cada uno tiene su propio mecanismo de hooks/plugins (Claude Code usa `.claude/settings.json`; Codex usa `.agents/plugins/marketplace.json`; otros usan configuraciones distintas). El patrón ya existe en proyectos como `duyet/codex-claude-plugins`, que mantiene manifiestos paralelos (`.claude-plugin/plugin.json` y `.codex-plugin/plugin.json`) para el mismo plugin, y en `oh-my-openagent`, descrito como un "agent OS" multi-harness para OpenCode, Codex, Claude Code y otros agentes de código con orquestación en modo equipo.
- **Dashboard unificado:** una sola vista de sesiones activas etiquetadas por harness y modelo, para comparar comportamiento entre ellos (ej. "esta tarea la hizo Claude Code con Sonnet en 4 min y Codex en 7 min").
- **Delegación cruzada:** capacidad de que un agente de un harness le pida una tarea o segunda opinión a otro (ya mencionado en Fase 6.3), lo cual solo tiene sentido si la capa de datos ya es multi-harness desde la base.

**Implicación de diseño:** construye primero el esquema de eventos normalizado y el primer adaptador (Claude Code). Añadir el segundo harness (ej. Codex) debe ser "solo" escribir un nuevo adaptador, sin tocar servidor, base de datos ni dashboard — esa es la prueba de que la abstracción está bien hecha.

## 0.6 Stack técnico obligatorio

- **Frontend: Angular.** Todos los dashboards (board de sesiones en vivo, panel de detalle, explorador de skills/plugins, editor de skills, reporting) se construyen como una SPA en Angular, no en Vue/React como hacen los proyectos de referencia investigados. Comunicación con el backend vía WebSocket (para eventos en vivo) y HTTP/REST (para consultas históricas y acciones como instalar/actualizar un plugin).
- **Backend: Node.js.** El servidor de ingesta (endpoint que reciben los hooks), la capa de persistencia y el servidor WebSocket se implementan en Node.js, en vez de Bun/Python (uv) como en los proyectos de referencia. SQLite sigue siendo válido como motor de base de datos (vía un driver Node como `better-sqlite3`), migrable a Postgres si el proyecto crece a multiusuario.

**Implicación sobre los adaptadores multi-harness (0.5):** cada adaptador de harness (Claude Code, Codex, etc.) sigue siendo un script ligero e independiente del lenguaje del hook nativo de cada herramienta (normalmente Python o shell); lo único que debe hablar Node.js/Angular es el servidor central y el dashboard, no necesariamente el propio script de hook.

## 0.7 Desarrollo y distribución sobre Docker

- **Desarrollo:** todo el entorno de desarrollo se levanta con Docker/Docker Compose — servicio de backend (Node.js), servicio de frontend (Angular con hot-reload), y el volumen/servicio de la base de datos SQLite (o Postgres si se migra). Nadie desarrolla contra un Node/Angular instalado directamente en la máquina; `docker compose up` debe dejar el entorno completo funcionando.
- **Distribución:** el producto final se empaqueta y distribuye como imagen(es) Docker, no como instalador nativo ni script de setup manual (`bootstrap.sh`, `install.sh`, etc., como hacen algunos proyectos de referencia). Como mínimo:
  - Una imagen para el backend (Node.js + servidor de ingesta/WebSocket).
  - Una imagen para el frontend (Angular compilado, servido por Nginx o similar).
  - Un `docker-compose.yml` de referencia para levantar todo junto en local o en un servidor, incluyendo el volumen persistente de la base de datos.
- **Implicación sobre los adaptadores multi-harness (0.5):** los scripts de hook que corren en la máquina del desarrollador (fuera de los contenedores, porque son los que Claude Code/Codex/etc. ejecutan localmente) deben apuntar al endpoint HTTP/WebSocket expuesto por el contenedor del backend (ej. `http://localhost:PUERTO`), documentando claramente qué puerto exponer en el `docker-compose.yml`.
- **Publicación de imágenes:** considerar publicar las imágenes en un registry (Docker Hub, GHCR) versionadas por tag, para que instalar la app sea `docker compose pull && docker compose up` en vez de clonar y construir desde cero.

---

## 1. MVP (Fase 1) — Observabilidad básica

### 1.1 Ingesta de eventos (dos capas distintas del mismo pipeline)

Importante: **captura** y **transporte en vivo** son dos problemas diferentes, no la misma funcionalidad repetida.

**a) Captura — hooks (el origen del dato)**

- Script de hook del Adaptador (`adapters/claude-code/send_event.mjs`, Node sin dependencias) que se registra en la configuración del Harness (`.claude/settings.json` en Claude Code) para los hooks: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `SessionEnd`.
- Cada vez que ocurre uno de estos hooks, el Adaptador lo traduce al Evento normalizado (Proyecto, Directorio, Sesión, Tipo de evento, payload…; ADR-0002 y `mvp-fase1.md`) y lo envía por HTTP al servidor. Sin esto no hay datos que observar.
- Sin flag `--add-chat`: el Evento no incluye la conversación; el Transcript se lee bajo demanda desde `~/.claude` montado en solo lectura (ADR-0003).

**b) Persistencia — base de datos**

- Base de datos ligera (SQLite es el estándar en estos proyectos) donde el servidor guarda cada evento recibido por HTTP. Es lo que te permite consultar historial, no solo ver el presente.

**c) Transporte en vivo — WebSocket (la entrega a la UI)**

- Una vez el evento está guardado, el servidor lo reenvía por WebSocket a todos los clientes/dashboards conectados en ese momento.
- Esto es lo que da la sensación de "tiempo real": sin WebSocket, el dashboard tendría que hacer polling (pedir "¿hay algo nuevo?" cada pocos segundos) en vez de recibir el push instantáneo.
- Resumen del flujo completo: `hook → HTTP POST → servidor → SQLite → WebSocket push → dashboard`.

### 1.2 Dashboard en tiempo real

- Vista tipo "board" de sesiones activas, agrupadas por proyecto → sesión → directorio.
- Stream en vivo de eventos vía WebSocket (sin refrescar).
- Filtrado de eventos por tipo, proyecto, sesión o rango de tiempo.
- Indicador de "pulso" / vivo / inactivo por sesión (liveness reconciliation), con detección de sesiones huérfanas (el proceso murió sin emitir `SessionEnd`).

### 1.3 Panel de detalle de sesión

- Modelo usado, tokens consumidos, % de contexto ocupado (leído directamente del transcript on-demand, no solo de los eventos).
- Duración real de la sesión (no solo timestamp de inicio/fin, sino tiempo "honesto" descontando pausas).
- Línea de tiempo de herramientas invocadas (Bash, Edit, Read, etc.) con sus inputs/outputs resumidos.
- Historial de prompts de usuario enviados en esa sesión.
- Subagentes lanzados en la sesión: tipo, tarea, herramientas y respuesta de cada uno (rebanada 3b de `mvp-fase1.md`; ampliado en 1.7).

### 1.4 Validación básica vía hooks

- Hook `PreToolUse` que puede bloquear comandos peligrosos antes de ejecutarse (ej. `rm -rf`, credenciales expuestas).
- Registro de qué se bloqueó y por qué, visible en el dashboard.

### 1.5 Visor de estado de tests (unitarios y E2E)

- Vista por Proyecto del último resultado conocido de los tests **unitarios** (Vitest, `node:test`…) y de los tests **E2E** (Playwright), separados en dos bloques.
- Resumen por ejecución: total, pasados, fallidos, omitidos, duración y momento de la ejecución; indicador de estado global (verde / rojo / sin datos).
- Detalle de los tests fallidos: nombre, fichero, mensaje de error resumido y, si existe, el `AC-*` que cita el test.
- Origen del dato: las ejecuciones de tests que lanzan los agentes durante una Sesión (detectadas en los Eventos de herramienta `Bash`). Leer los reportes de los runners (JSON o JUnit XML) del Proyecto queda para después del MVP.
- Enlace de cada ejecución con la Sesión (y el Subagente, si aplica) que la lanzó, para ver qué cambio rompió o arregló los tests.
- Actualización en vivo vía WebSocket cuando termina una nueva ejecución.

### 1.6 Uso de skills en las Sesiones

- Detección de las Invocaciones de skill de cada Sesión, venga de donde venga la invocación. Se derivan en el servidor al consultar, igual que las Ejecuciones de tests (ADR-0007), sin Tipo de evento nuevo ni cambios en el Adaptador:
  - invocadas por el agente o un Subagente: Eventos de la herramienta `Skill` (`tool_input.skill`, `tool_input.args`) y, además, los bloques `tool_use` de `Skill` de los Transcripts del agente principal y de cada Subagente, que recogen las invocaciones que el hook no envió (Subagentes, Sesiones o tramos sin el hook activo). Se unen sin duplicar por `tool_use_id`;
  - invocadas por la persona usuaria con `/nombre`: un `prompt.submitted` cuyo prompt *empieza* por `/nombre`, donde `nombre` no contiene otra `/` (`/spec/roadmap` no cuenta). Claude Code no emite Evento `Skill` en este caso. Los comandos del Harness que llegan al hook (`/init`, `/review`…) cuentan como Skills; los locales (`/clear`) no llegan.
- Resumen de una línea propio para la herramienta `Skill` (`Skill · <nombre>`), en vez de depender del primer campo de texto de la entrada.
- Estado de la invocación: la herramienta `Skill` solo carga instrucciones y termina en milisegundos, así que la invocación sigue **en curso** hasta que termina el Turno en que se cargó (o el Subagente que la cargó), y esa es su duración. Queda **fallida** si la carga falló (`payload.error` o `tool_response.success: false`).
- Pestaña **Skills** en el detalle de Sesión: lista de invocaciones con momento, skill, argumentos, quién la invocó (agente, persona usuaria o Subagente), estado y duración, y un enlace a su Turno en la pestaña *Línea de tiempo*. Una skill no devuelve respuesta propia; lo que hizo el agente con ella se ve en su Turno.
- Pantalla **Skills** en el menú lateral (grupo *Observar*): tabla por Proyecto y skill con número de invocaciones (por agente / persona usuaria / Subagente) y última invocación, con el periodo del board. Cada fila despliega sus invocaciones con enlace a la Sesión. Solo muestra las skills usadas.
- Actualización en vivo vía WebSocket, como el resto de Eventos.
- Fuera de alcance: detectar las skills que nunca se disparan, que necesita el catálogo (el backend solo ve `~/.claude`, no las `.claude/skills/` de cada Directorio, ADR-0003). Van con el catálogo y su `SKILL.md` (Fase 2.1), que ampliará esta misma pantalla. También queda fuera la evaluación de *trigger accuracy* (Fase 2.3).

### 1.7 Visibilidad completa de los Subagentes

Punto de partida: la rebanada 3b de `mvp-fase1.md` ya muestra cada Subagente dentro del detalle de su Sesión (pestaña **Subagentes**: tarea, herramientas y respuesta). Faltan un acceso directo, un inicio fiable y distinguir el ruido. Todo se deriva en el servidor al consultar, sin Tipo de evento nuevo ni cambios en el Adaptador (como ADR-0007).

- **Inicio visible siempre**: hoy el comienzo depende solo del hook `SubagentStart`. Se deriva también del `PreToolUse` de la herramienta `Agent`/`Task` (`tool_input.subagent_type`, `description`, `prompt`), que marca el lanzamiento aunque falte `SubagentStart`. Enlace del lanzamiento con su Subagente:
  - exacto: `toolUseId` de `agent-<id>.meta.json` en el Transcript, o `tool_response.agentId` del `PostToolUse` de `Agent`;
  - mientras no llega el exacto, un `SubagentStart` se empareja con el lanzamiento sin enlazar más antiguo de la misma Sesión y el mismo Tipo de Subagente;
  - un lanzamiento sin enlazar es un Subagente *pendiente* que ya cuenta como en marcha.
- **Sin `SubagentStop` al terminar el Turno**: un Subagente sin fin solo está en marcha con su Sesión viva y el Turno abierto. Al llegar `turn.ended` sin su `subagent.stopped`, deja de contar como en marcha en el board, las métricas y las pantallas Subagentes y Agentes, y su estado en el detalle de la Sesión pasa a *sin respuesta* (AC-125, AC-126).
- **Fin y respuesta**: la respuesta sigue saliendo de `SubagentStop` o del Transcript. El `PostToolUse` de `Agent` sirve para enlazar; solo si es síncrono (sin `status: async_launched`, que llega al lanzar un Subagente en segundo plano) y falta `SubagentStop`, marca además el fin.
- **Eventos de Subagente legibles**: "Subagente iniciado" y "Subagente terminado" muestran en su resumen el Tipo de Subagente y la tarea (`e2e-builder · generar tests del AC-28`); el de fin, además, la duración. El servidor añade esos datos a cada Evento de Subagente, en `GET /events` y en el mensaje del WebSocket.
- **Subagentes internos**: Claude Code lanza agentes auxiliares propios (p. ej. sugerencias de prompt) que emiten `SubagentStop` con `agent_type` vacío, sin `SubagentStart`, sin lanzamiento y sin Eventos propios. Se marcan como *internos*: se excluyen siempre del board y de las métricas, y en la pestaña Subagentes, la pantalla Subagentes y la lista de Eventos se ocultan por defecto, con un filtro "Mostrar internos".
- **Pantalla Subagentes en el menú lateral** (`/subagentes`, grupo *Observar*): lista de los Subagentes de todas las Sesiones, con Tipo de Subagente, tarea, Sesión, Proyecto, inicio, duración, estado (en marcha / terminado), herramientas y tokens; filtrable por Tipo de Subagente, Proyecto y periodo (el del board, por defecto 24 h); cada fila enlaza a `/sesiones/<id>?pestana=subagentes&subagente=<id>` con el Subagente desplegado.
- **Vista agregada por Tipo de Subagente**: se entregó en `/subagentes` y pasa a la pantalla Agentes (1.10), que la amplía con un perfil por Tipo.
- Actualización en vivo vía WebSocket, como el resto de Eventos.

### 1.8 Desglose por Directorio y por modelo de las fichas del board

Hoy, para comparar una cifra de las fichas (p. ej. el Coste estimado) entre Directorios hay que aplicar el filtro de Directorio uno a uno, y no hay forma de verla por modelo.

- **Click en una ficha → modal con el desglose**: al pulsar cualquier ficha del board se abre una pantalla modal con esa misma métrica repartida con dos vistas, conmutables con pestañas **Por Directorio** / **Por modelo** (se abre en la última usada). Todas las fichas son pulsables:
  - **Trabajando**: Sesiones trabajando y Subagentes en marcha.
  - **En pausa**: Sesiones en pausa y Huérfanas.
  - **Tokens de entrada**: entrada total, % leído de caché y tokens escritos en caché.
  - **Tokens de salida**: salida; en la vista por Directorio, además, su modelo principal.
  - **Coste estimado**: coste con su % sobre el total y aviso de modelos sin Tarifa o Transcripts no disponibles; en la vista por modelo, además, la Tarifa aplicada y el desglose del coste (entrada / salida / lectura de caché / escritura de caché).
  - **Herramientas**: llamadas a herramientas, prompts y Bloqueos.
- **Vista por Directorio**: una fila por Directorio con actividad en el periodo (ruta truncada por la izquierda, `…/Codev/mandarina`, con la ruta completa en el tooltip) y su Proyecto.
- **Vista por modelo**: una fila por modelo usado en el periodo (Opus, Sonnet, Haiku, Fable…, con el mismo badge de modelo que el resto de la UI), incluidos los usados por Subagentes. Reparto:
  - tokens y coste se atribuyen exactamente a cada modelo, respuesta a respuesta, leídos de los Transcripts (una Sesión que cambia de modelo a mitad reparte sus tokens entre ambos);
  - las métricas de conteo se atribuyen al modelo en uso: una Sesión trabajando o en pausa (o Huérfana) cuenta en el modelo de su última respuesta, y un Subagente en marcha en el de la suya; cada herramienta, prompt o Bloqueo cuenta en el modelo que se usaba cuando ocurrió (el de la respuesta anterior de su Sesión o Subagente, o la siguiente si aún no había ninguna). Así la suma de filas coincide siempre con el total;
  - lo que no tiene modelo conocido (Sesión sin Transcript, Subagente pendiente de enlazar) va a una fila **Modelo desconocido**.
- **Contenido del modal**: título con la métrica y el periodo ("Coste estimado · Últimos 7 días"); tabla con la fila de total que coincide con la cifra de la ficha; orden descendente por la métrica, reordenable por columna.
- **Mismo contexto que el board**: respeta el periodo seleccionado (1 h / 24 h / 7 d / todo) y el filtro de Directorio. Las fichas también siguen el filtro de Directorio del board (hoy muestran todo el periodo aunque el board esté filtrado); con un filtro activo, el modal lo indica, la vista por Directorio muestra solo ese Directorio y la vista por modelo reparte solo su actividad.
- **Del desglose al filtro**: pulsar un Directorio del modal cierra el modal y aplica ese filtro de Directorio en el board. El board no filtra por modelo, así que las filas de modelo no son pulsables (el filtro por modelo queda fuera de este punto).
- **Accesibilidad**: la ficha se activa también con teclado (Enter / Espacio), el modal se cierra con `Esc`, con el botón de cerrar y pulsando fuera, y devuelve el foco a la ficha.
- **Datos**: `/api/v1/metrics` acepta `directory` y, solo con `breakdown=true` (mientras el modal está abierto), añade un `breakdown` con `by_directory` y `by_model`, cada fila con las mismas cifras que el total. Las fichas no pagan el coste de situar cada Evento en su modelo. El modal se refresca como las fichas.
- **UI**: modal con el patrón de la skill `angular-modal` (botón de cerrar `@lucia/button`) y tabla HTML semántica con cabeceras ordenables, como el resto de tablas de agregados (`@lucia/table` no se usa, `spec/design.md` §9). La pestaña se abre en la última vista usada, guardada en el navegador (no en la URL).

### 1.9 Observador de servidores MCP

Hoy las herramientas de los servidores MCP llegan como cualquier otra (`tool.pre` / `tool.post` con `tool_name` `mcp__<servidor>__<herramienta>`), pero no hay forma de ver qué servidores usa cada Sesión, cuánto tardan, cuánto fallan ni cuánto contexto consumen sus respuestas. Datos reales de partida: el `PreToolUse` trae `mcp_server: { name, source }` (servidor y ámbito de su configuración), el `PostToolUse` trae `duration_ms`, hay invocaciones sin `PostToolUse` y una captura de `mcp__playwright__browser_take_screenshot` ocupa ~120 KB por Evento.

- **Detección**, derivada en el servidor al consultar como las Ejecuciones de tests (ADR-0007), sin Tipo de evento nuevo ni cambios en el Adaptador:
  - servidor y ámbito del `mcp_server` del `tool.pre`; si falta (versiones antiguas), el servidor sale del `tool_name`, partiendo por `__` (un servidor puede llevar `_` en su nombre: `mcp__claude_ai_Claude_Docs__batch`);
  - las herramientas de recursos `ListMcpResourcesTool` / `ReadMcpResourceTool` cuentan para el servidor de su `tool_input.server`;
  - la detección es propia de cada Harness (§0.5): otro Adaptador puede nombrar distinto las herramientas MCP.
- **Invocación de una Herramienta MCP**: cada `tool.pre` enlazado por `tool_use_id` con su `tool.post`. Estado, siempre con texto: **bien**, **error** (`PostToolUseFailure`), **interrumpida** (`PostToolUseFailure` con `is_interrupt: true`, cuando la persona usuaria pulsa `Esc`; no cuenta como fallo del servidor), **bloqueada** (`tool.blocked`), **en curso** o **sin respuesta** (sin `tool.post` cuando ya terminó su Turno o su Subagente, o la Sesión está Cerrada o Huérfana). Latencia: `duration_ms` del `tool.post`; si falta, la diferencia entre `tool.pre` y `tool.post`. Tamaño de la respuesta: KB de `tool_response`, con el aviso "incluye imagen" si trae bloques `image` (no se estiman tokens: los de una imagen no salen de sus bytes en base64). Quién la invocó: agente principal o Subagente.
- **Resumen de una línea** propio: `playwright · browser_navigate · http://localhost:4200` (servidor, herramienta y el primer campo de texto de la entrada), en la lista de Eventos, en la herramienta en curso del board y en las herramientas de los Subagentes. Nueva categoría **MCP** en el filtro de `/eventos`.
- **Pantalla MCP en el menú lateral** (`/mcp`, grupo *Observar*): una fila por Servidor MCP (por nombre; sus ámbitos se listan en la fila) con herramientas usadas, llamadas, % de fallos (sin contar las interrumpidas) y de sin respuesta, latencia mediana y p95, tamaño medio y máximo de respuesta, última llamada y Sesiones / Proyectos que lo usan. Cada servidor se despliega por herramienta con las mismas cifras; cada herramienta enlaza a sus invocaciones en `/eventos`. Periodo del board, por defecto 7 d (el uso de MCP es esporádico), y filtros por Proyecto y servidor, reflejados en la URL. Sin ficha propia en el board: la herramienta en curso de cada tarjeta ya lleva el resumen MCP.
- **Pestaña MCP en el detalle de Sesión**: invocaciones en orden con hora, servidor, herramienta, entrada resumida, quién la invocó, estado con texto, latencia y tamaño de la respuesta; y un resumen por servidor de esa Sesión.
- **Herramientas diferidas**: las Herramientas MCP que un agente carga con `ToolSearch` (las de `tool_response.matches`, tanto de `select:` como de una búsqueda libre) y nunca invoca en la Sesión se listan aparte en la pestaña MCP; cuestan contexto sin aportar nada.
- **Respuestas grandes**: se guardan completas, sin recortar. El Adaptador no descarta nada de lo que envía el Harness (ADR-0002) y el detalle de una invocación enseña la respuesta real. El crecimiento de SQLite por las capturas en base64 se controla con la retención de 1A.9, no en la ingesta.
- Actualización en vivo vía WebSocket, como el resto de Eventos.
- Fuera de alcance: el catálogo de servidores configurados y los que nunca se usan (`.mcp.json` vive en cada Directorio y `~/.claude.json` queda fuera del volumen `~/.claude`, ADR-0003; van con 2.0 y 2.1); arrancar, parar o configurar servidores (Fase 2); avisos de servidor lento o de fallos seguidos (1A.4); Mandarina como servidor MCP (1A.11).

### 1.10 Observador de agentes

El 1.7 muestra cada Subagente, pero no deja ver cómo trabaja un Tipo de Subagente concreto: quién lo lanza, qué herramientas, skills y Servidores MCP usa, cómo acaban sus Lanzamientos y cuánto cuesta frente a los demás. Datos reales de partida: el `tool_input` de `Agent` trae `subagent_type`, `description`, `prompt` y `run_in_background`; el `.meta.json` del Transcript trae `agentType`, `toolUseId`, `spawnDepth` y `requestShape`; los Tipos que aparecen son integrados (`Explore`, `general-purpose`) y del Proyecto (`security-gate`, `code-quality-gate`). En Claude Code un Subagente no puede lanzar otros Subagentes (todos los `.meta.json` tienen `spawnDepth: 1`): solo lanza el agente principal.

- **Perfil de cada Tipo de Subagente**, derivado en el servidor al consultar a partir del ciclo de vida del 1.7, sin Tipo de evento nuevo ni cambios en el Adaptador:
  - **Uso**: Lanzamientos por día en el periodo (barras verticales con `@lucia/element-bars`, skill `ui-lucia-module-bars`), en marcha, en primer plano frente a segundo plano (`run_in_background`), Sesiones y Proyectos en que se usa;
  - **Coste y tiempo**: duración mediana y p95, tokens y Coste estimado (total y por Lanzamiento) y modelos con que responde, leídos de los Transcripts de sus Subagentes;
  - **Cada Lanzamiento**: estado **terminado**, **sin respuesta** (sin `subagent.stopped` en una Sesión Cerrada o Huérfana, o cuando el Turno de su Sesión ya terminó) o **en marcha**; cuántas herramientas fallaron y cuántos Bloqueos tuvo (un contador, no un estado: un agente que encuentra tests en rojo hace bien su trabajo aunque falle un `Bash`); y su respuesta final resumida si el Transcript está disponible;
  - **Qué hace**: herramientas que invoca (llamadas, con error y Bloqueos por herramienta), skills que carga (1.6), Servidores MCP que usa (1.9) y Ejecuciones de tests que lanza con su resultado (1.5).
- **Quién lo lanza**: el agente principal de la Sesión. Si los Eventos del agente principal traen su propio `agent_type` (una Sesión arrancada como agente, `claude --agent …`), se muestra ese Tipo como lanzador. Si algún día llegan Lanzamientos desde un Subagente (`tool.pre` de `Agent` con `subagent_id`), el perfil añade una matriz "quién lanza a quién"; no se dibuja un árbol de delegación que los datos no pueden llenar.
- **Pantalla Agentes en el menú lateral** (`/agentes`, grupo *Observar*): tabla comparativa de todos los Tipos (Lanzamientos, en marcha, sin respuesta, duración mediana, coste medio por Lanzamiento, herramientas con error y Bloqueos por Lanzamiento, y última vez), ordenable, con el periodo del board (por defecto 7 d: los Lanzamientos son esporádicos) y filtro por Proyecto. Cada Tipo enlaza a su perfil `/agentes/<tipo>`, con sus Lanzamientos (cada uno a `/sesiones/<id>?pestana=subagentes&subagente=<id>`) y lo que hace.
- **`/subagentes` deja la vista por Tipo** (1.7) en manos de `/agentes`: queda como lista de Subagentes, y el Tipo de cada fila enlaza a su perfil. Una sola tabla por Tipo evita cifras duplicadas que no cuadren.
- **Tipos sin nombre**: los Subagentes internos (1.7) quedan fuera; los Lanzamientos sin Tipo conocido se agrupan como "Sin Tipo".
- Actualización en vivo vía WebSocket, como el resto de Eventos.
- Fuera de alcance: comparar lo declarado en la definición del agente (`tools`, `model` y descripción del frontmatter de `.claude/agents/*.md`) con lo que usa de verdad, y los agentes definidos que nunca se lanzan: el backend no ve las `.claude/agents/` de cada Directorio (ADR-0003) y van con 2.0 y 2.1. Tampoco entran editar o crear agentes (Fase 2), evaluar la calidad de sus respuestas (Fase 5) ni los equipos de agentes (Fase 6.1).

### 1.11 Exportación OTLP con la convención OpenInference

Lo que ve Mandarina se queda en Mandarina: no hay forma de llevar las Sesiones a Jaeger, Grafana Tempo, Datadog, Langfuse o Arize Phoenix, donde se ve el resto de la infraestructura. Todos aceptan trazas OTLP, y Langfuse y Phoenix entienden además la convención semántica de OpenInference para agentes LLM. Decisiones en ADR-0008.

- **Opt-in**: el exportador está apagado por defecto (§9, privacidad por defecto). Se activa con las variables estándar de OpenTelemetry en `docker-compose.yml`: `OTEL_EXPORTER_OTLP_ENDPOINT` (o `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`) y `OTEL_EXPORTER_OTLP_HEADERS` para la autenticación del colector. No se configura desde la UI.
- **Una traza por Turno**, exportada cuando el Turno termina (`turn.ended`) o cuando su Sesión pasa a Cerrada o Huérfana con el Turno abierto. Antes no están completos ni los tokens ni las respuestas del modelo, que salen del Transcript (ADR-0003). Spans, con `openinference.span.kind`:
  - **`AGENT`** raíz: el Turno, de su `prompt.submitted` a su `turn.ended`;
  - **`LLM`**: cada respuesta del modelo del Transcript (deduplicada por `message.id`, como el Uso de tokens), con `llm.model_name`, `llm.token_count.prompt` / `completion` / `total`, `llm.token_count.prompt_details.cache_read` y `cache_write`, y los `gen_ai.usage.input_tokens` / `output_tokens` de la convención GenAI de OpenTelemetry, para los colectores que solo entienden esa;
  - **`TOOL`**: cada invocación de herramienta (`tool.pre` → `tool.post`, enlazadas por `tool_use_id`), con `tool.name`, estado `ERROR` si terminó con error, y un span sin fin marcado como *sin respuesta* si nunca llegó su `tool.post`. Un Bloqueo es un span `TOOL` con estado `ERROR` y un evento `mandarina.block` con la regla y el motivo;
  - **`AGENT`** hijo: cada Subagente lanzado en el Turno, colgando del span `TOOL` de su Lanzamiento, con `mandarina.subagent.type` y sus propias herramientas y respuestas debajo.
- **Atributos comunes**: `session.id` (convención de OpenInference para agrupar las trazas de una Sesión) y, como recurso, `service.name=mandarina`, `mandarina.project`, `mandarina.directory` y `mandarina.harness`. Cada span lleva también su Coste estimado (`mandarina.cost.usd`, ADR-0005).
- **Contenido opt-in aparte**: prompts, respuestas del modelo y entradas y salidas de herramientas (`input.value`, `output.value`) salen de la máquina solo si además se activa `MANDARINA_OTLP_INCLUDE_CONTENT=true`, y siempre enmascarados como en la ingesta. Sin él se exportan estructura, tiempos, tokens, coste, modelo y nombres de herramienta. `llm.system_prompt` no se exporta: Claude Code no escribe el prompt de sistema en el Transcript.
- **Identificadores deterministas**: el `trace_id` y los `span_id` se derivan de la Sesión, el Turno y los ids de Evento, de modo que un reintento reenvía los mismos ids y el colector puede reconocerlo en lugar de ver una traza nueva.
- **Nunca frena el flujo local**: la exportación corre en segundo plano, fuera de la ingesta y del hook (§9). El estado de exportación de cada Turno (pendiente / exportado / fallido) se guarda en SQLite, así que un reinicio del backend reanuda lo pendiente. Reintentos con espera creciente (3 como máximo); un Turno que sigue fallando queda como *fallido* y no bloquea a los siguientes.
- **Indicador en la UI**: con el exportador activo, la barra lateral muestra "Exportando a `<host>`" (con "incluye contenido" si aplica), y al pulsarlo se ven los Turnos pendientes, los exportados y los fallidos, con el último error. `GET /api/v1/exporter` devuelve ese estado.
- **Transporte**: OTLP/HTTP con JSON (`POST /v1/traces`), escrito a mano en el backend, sin el SDK de OpenTelemetry (ADR-0008).
- Fuera de alcance: métricas y logs OTLP, OTLP/gRPC y protobuf, exportar Sesiones anteriores a activar el exportador (con 1A.8), integraciones que no hablan OTLP (LangSmith, Sentry; Fase 7) y recibir trazas de otras herramientas.

### 1.12 Evaluación humana: puntuación, etiquetas y notas

Mandarina enseña qué hizo cada agente, pero no deja apuntar si lo hizo bien. Sin ese juicio no hay forma de reunir ejemplos buenos y malos para mejorar prompts, skills y agentes, ni de construir un conjunto de evals a partir del trabajo real. Absorbe las etiquetas y notas del 1A.6.

- **Evaluación**: el juicio de la persona usuaria sobre una **Sesión**, un **Turno** (la respuesta del agente a un prompt) o un **Subagente** (su respuesta a la Tarea). Una Evaluación por objeto, editable y borrable, con tres partes opcionales:
  - **Puntuación** binaria: +1 (bien) / −1 (mal), o sin puntuar. No hay escala de estrellas: con dos escalas no se pueden sumar los agregados ni comparar un dataset con otro;
  - **Etiquetas** libres: se crean al escribirlas, con autocompletado de las ya usadas y, de sugerencia inicial, `bug-fix`, `hallucination`, `prompt-breakdown` y `refactor`. Minúsculas y con guiones, para que `Bug fix` y `bug-fix` no cuenten como dos;
  - **Nota**: texto libre que explica el porqué ("inventó un endpoint que no existe", "resolvió el AC-28 a la primera").
- **Identidad del objeto evaluado**: la Sesión por su `session_id`, el Subagente por su `subagent_id` y el Turno por el id de su Evento `prompt.submitted`, porque el Turno se deriva y no tiene id propio.
- **Dónde se evalúa**, siempre con los mismos controles (pulgar arriba / pulgar abajo, etiquetas como chips `@lucia/filterchip` y campo de nota):
  - en la cabecera del detalle de Sesión, la Sesión;
  - en la pestaña *Línea de tiempo*, cada Turno;
  - en la pestaña *Subagentes*, cada Subagente.
  La Evaluación se guarda al cambiarla, sin botón de guardar.
- **Dónde se ve**: la tarjeta de la Sesión en el board muestra su Puntuación si la tiene. El perfil de cada Tipo de Subagente (1.10) añade cuántos de sus Subagentes tienen +1 y cuántos −1, y la comparativa de `/agentes` gana una columna con el % de +1 sobre los puntuados.
- **Pantalla Evaluaciones en el menú lateral** (`/evaluaciones`, grupo *Observar*): lista de Evaluaciones con objeto (Sesión / Turno / Subagente, con el prompt o la Tarea resumidos), Proyecto, Puntuación, etiquetas, nota y fecha, cada fila con enlace a su objeto en el detalle de Sesión. Filtros por tipo de objeto, Puntuación, etiqueta, Proyecto y periodo, reflejados en la URL, y recuento de uso por etiqueta.
- **Dataset de evaluación**: la pantalla exporta a JSONL las Evaluaciones que pasan el filtro, una línea por objeto evaluado, con Proyecto, Sesión, modelo, prompt (el del Turno, la Tarea del Subagente o todos los de la Sesión), respuesta final del agente, herramientas usadas, Puntuación, Etiquetas y Nota. La respuesta es la que trae el hook `Stop` o `SubagentStop`, que ya está guardada y enmascarada, y no depende del Transcript; solo el modelo sale de él (`null` sin Transcript). El contenido sale enmascarado como en la ingesta.
- **Datos**: las Evaluaciones son lo primero que escribe la persona usuaria en Mandarina. No son Eventos (no son hechos observados en la Sesión), así que no pasan por la ingesta: van en su propia tabla de SQLite, con `GET` / `PUT` / `DELETE /api/v1/evaluations/{objeto}/{id}`, `GET /api/v1/evaluations` con los filtros de la pantalla, `GET /api/v1/evaluations/tags` y `GET /api/v1/evaluations/export`. Sin difusión por WebSocket: Mandarina es monousuario y la Evaluación cambia desde la propia pantalla.
- Fuera de alcance: escala de estrellas, varias personas evaluando el mismo objeto (7.1), evaluación automática con LLM como juez y ejecutar los evals exportados (2.3 y Fase 5), evaluar una sola herramienta, y purgar Evaluaciones junto con su Sesión (1A.9).

### 1.13 Enmascarado de secretos y PII, y Avisos de inyección

Hoy el servidor enmascara al ingerir un conjunto corto de secretos (AC-06) y los reemplaza por `***`: no reconoce JWT, claves privadas ni datos personales, no dice qué había debajo, y el secreto ya ha viajado en claro del hook al servidor. Tampoco se ve cuándo un agente lee contenido que intenta darle órdenes (prompt injection indirecto), que es el riesgo propio de un agente con herramientas.

- **Más secretos reconocidos**, además de los de AC-06: JWT (`eyJ….eyJ….…`), bloques de clave privada PEM (`-----BEGIN … PRIVATE KEY-----` hasta su `END`), credenciales en URLs de conexión (`postgres://usuario:clave@…`, solo la clave), claves de Google (`AIza…`), Stripe (`sk_live_…`, `rk_live_…`), npm (`npm_…`) y webhooks de Slack.
- **PII**: correos, teléfonos (E.164 y nacionales españoles), IBAN (con dígitos de control válidos), números de tarjeta (13–19 dígitos que pasan Luhn) y DNI/NIE (con letra de control válida). Validar el dígito de control evita tapar identificadores y números cualquiera. Cada categoría de PII se desactiva con `MANDARINA_MASK_PII` (lista de categorías; por defecto, todas). Los secretos no se pueden desactivar.
- **Marcadores con tipo** en lugar de `***`: `[REDACTED_API_KEY]`, `[REDACTED_TOKEN]` (Bearer y JWT), `[REDACTED_PRIVATE_KEY]`, `[REDACTED_PASSWORD]` (asignaciones `CLAVE=valor`, propiedades JSON y URLs de conexión), `[REDACTED_EMAIL]`, `[REDACTED_PHONE]`, `[REDACTED_IBAN]`, `[REDACTED_CARD]` y `[REDACTED_ID]`. Quien lee un comando entiende qué se quitó sin verlo. Lo ya guardado con `***` no se migra, y la UI trata igual ambas formas.
- **Enmascarado en el origen**: el Adaptador enmascara antes de enviar, así que el secreto no sale del proceso del hook. El servidor vuelve a enmascarar al ingerir, como red de seguridad para Adaptadores antiguos o de otros Harness, y enmascara también todo lo que lee del Transcript y devuelve o exporta (respuestas de los Subagentes, 1.11, 1.12). Los patrones existen en dos copias con la misma lógica (Adaptador y backend), guardadas por unas mismas fixtures, porque la imagen del backend no ve `adapters/` — ADR-0009.
- **Aviso de inyección**: contenido leído por una herramienta que parece dar órdenes al agente. Se deriva en el servidor al consultar, como las Ejecuciones de tests (ADR-0007), sin Tipo de evento nuevo ni cambios en el Adaptador. Así, mejorar el catálogo de patrones aplica también a los Eventos ya guardados.
  - **Dónde se busca**: en el `tool_response` de `WebFetch`, `WebSearch`, `Read`, las Herramientas MCP (1.9) y los `Bash` que descargan contenido (`curl`, `wget`). No se mira en los prompts de la persona usuaria ni en las respuestas del modelo.
  - **Qué se busca**, con un catálogo de patrones fijado con fixtures en los tests de dominio:
    - órdenes de anulación: "ignore (all) previous instructions", "disregard the above", "olvida las instrucciones anteriores", "you are now…", "new system prompt";
    - suplantación del sistema o de la conversación: etiquetas `<system>` / `</user>`, `[SYSTEM]`, `<|im_start|>`, líneas `Human:` / `Assistant:`;
    - texto oculto: caracteres Unicode de etiqueta (U+E0000–E007F), controles bidireccionales y rachas de caracteres de ancho cero; órdenes dentro de comentarios HTML o de elementos ocultos (`display:none`);
    - exfiltración: pedir enviar datos a una URL, `curl … | sh`, leer `.env` o claves y mandarlas fuera, imágenes Markdown hacia dominios externos con datos en la query.
  - **Severidad**: **alta** (texto oculto con caracteres de etiqueta, exfiltración, suplantación del sistema), **media** (órdenes de anulación) o **baja** (comentarios HTML con verbos imperativos, ancho cero).
  - **Contexto**: cada aviso muestra la fuente (herramienta y URL, fichero o Servidor MCP), el fragmento con el patrón resaltado, la Sesión y el Subagente, y las herramientas que el agente invocó justo después en el mismo Turno. Un aviso seguido de un `Bash` con red o de un Bloqueo es lo que merece mirarse primero.
  - **Avisa, no bloquea**: las heurísticas dan falsos positivos (un README que documenta prompt injection), y bloquear sobre ellas rompería el trabajo (§9). Cada aviso se puede **descartar** como falso positivo; el descarte se guarda en SQLite y el aviso deja de contarse.
- **Dónde se ve**:
  - **Pantalla Seguridad** en el menú lateral (`/seguridad`, grupo *Observar*), con dos pestañas. *Avisos de inyección*: lista filtrable por severidad, patrón, fuente, Proyecto, periodo y descartados, reflejada en la URL, con enlace al Evento en el detalle de Sesión. *Enmascarado*: cuántos marcadores de cada tipo hay por Proyecto en el periodo, contados en los payloads guardados.
  - La tarjeta del board de una Sesión con avisos de severidad alta sin descartar lleva un badge. En `/eventos` y en la *Línea de tiempo*, los Eventos con aviso se marcan y hay una categoría **Avisos** en el filtro. El servidor añade los avisos a cada Evento en `GET /events` y en el mensaje del WebSocket, como los datos de Subagente del 1.7.
- Fuera de alcance: bloquear por un Aviso de inyección, clasificar con un LLM (opt-in, como 1A.10), buscar en los Transcripts completos, volver a enmascarar lo ya guardado (con 1A.9), PII de otros países salvo correos y teléfonos E.164, y enmascarado configurable de rutas personales o datos de clientes (7.1).

### 1.14 Eficiencia de la caché de prompts

El 1.8 ya muestra, en el modal de *Tokens de entrada*, el % leído de caché y los tokens escritos. Lo que falta es saber cuánto dinero ahorra la caché, cuánto cuesta escribirla y dónde se rompe: una Sesión que vuelve a escribir todo su contexto tras una pausa paga la escritura sin aprovecharla. Todo se deriva del Uso de tokens del Transcript (ADR-0003) y de las Tarifas (ADR-0005), sin Tipo de evento nuevo ni cambios en el Adaptador.

- **Tasa de acierto de caché**: `cache_read / (input + cache_read + cache_creation)`, es decir, la parte de los tokens de entrada que se leyó de caché.
- **Ahorro por caché**, por modelo y con su Tarifa:
  - **ahorro bruto**: lo que habrían costado los tokens de `cache_read` a Tarifa de entrada, menos lo que costaron a Tarifa de lectura de caché;
  - **sobrecoste de escritura**: lo que se pagó de más al escribir en caché frente a la entrada normal (×0,25 con TTL de 5 min y ×1 con 1 h);
  - **ahorro neto** = bruto − sobrecoste. Puede ser negativo: se escribió más de lo que luego se releyó, y la UI lo muestra así, en rojo, no como cero. Los modelos sin Tarifa no suman y se avisan como en el Coste estimado.
- **Reescrituras de caché**: respuestas del modelo que, con la Sesión o el Subagente ya en marcha, vuelven a escribir en caché la mayor parte de su contexto (más de la mitad de sus tokens de entrada) en lugar de leerlo. Cada una lleva su coste de escritura y una causa probable, deducida de los datos:
  - **caducada**: pasó más que su TTL (5 min o 1 h, según la clase de escritura) desde la respuesta anterior;
  - **cambio de modelo**: la respuesta anterior era de otro modelo;
  - **compactación**: coincide con una compactación del contexto (cuando se capture, 1A.3);
  - **otra**: cambió el prefijo (herramientas, `CLAUDE.md`, prompt de sistema).
- **Dónde se ve**:
  - **Ficha Caché** en el board: tasa de acierto y ahorro neto del periodo, con el mismo filtro de Directorio que el resto de fichas. Al pulsarla se abre el modal del 1.8 con las vistas *Por Directorio* y *Por modelo*: tasa, tokens leídos, tokens escritos (5 min / 1 h), ahorro bruto, sobrecoste de escritura, ahorro neto y reescrituras. La fila de total coincide con la ficha;
  - **detalle de Sesión**: tasa y ahorro neto junto al Coste estimado, y las reescrituras de caché en la *Línea de tiempo*, cada una con su causa y su coste;
  - **perfil de cada Tipo de Subagente** (1.10): tasa de acierto y ahorro neto por Lanzamiento. Un Subagente arranca con el contexto vacío, así que su tasa suele ser baja: se compara entre Tipos, no con la de la Sesión.
- **Datos**: `/api/v1/metrics` añade un bloque `cache` (y las mismas cifras en cada fila de `breakdown`); el detalle de Sesión añade `cache` y `cache_rewrites`.
- Fuera de alcance: la **reducción de latencia**. Mandarina no conoce la latencia que habría tenido cada respuesta sin caché, y el Transcript no trae la latencia de cada respuesta, así que cualquier cifra sería inventada. Tampoco entran recomendaciones automáticas para mejorar la caché (con 2.7) ni caché de proveedores que no sean Anthropic.

### 1.15 Presupuestos: avisos y parada del agente al superarlos

El Coste estimado se ve, pero nada impide que una Sesión desbocada (un bucle, un Subagente que no termina) siga gastando mientras nadie mira el board. Absorbe el 7.3 salvo los canales externos. Decisiones en ADR-0010.

- **Presupuesto**: un límite de Coste estimado (USD) para un **ámbito**:
  - **por Sesión**: se aplica a cada Sesión por separado, de todos los Proyectos o de uno;
  - **por Proyecto y día**: el coste de un Proyecto en el día;
  - **global por día**: el coste de todos los Proyectos en el día.
  El día es el natural en la zona horaria del backend (`TZ` en `docker-compose.yml`). El coste incluye el de los Subagentes, igual que en las fichas.
- **Estado del presupuesto**: **Dentro**, **Cerca** (al llegar a su umbral de aviso, por defecto el 80 %) o **Superado**. Cada Presupuesto tiene una acción al superarse: **solo avisar** o **detener** (por defecto, detener).
- **Avisos en la UI**: al pasar a Cerca o a Superado, un aviso destacado en la cabecera, visible desde cualquier pantalla, con el ámbito, lo gastado y el límite, y un sonido corto. El sonido se genera en el navegador (Web Audio), solo suena si la persona usuaria ya ha interactuado con la página (política de autoplay de los navegadores) y se silencia con un interruptor que se guarda en el navegador. El cambio de estado llega por el WebSocket. Las notificaciones del sistema van con 1A.1, y los webhooks y el correo siguen en la Fase 7.
- **Detener el agente**: con un Presupuesto Superado y acción *detener*, el hook para al agente en su ámbito:
  - en `PreToolUse`, devuelve `continue: false` con un `stopReason` que explica qué presupuesto se superó. Así Claude Code para el agente, en vez de solo rechazar la herramienta (con `permissionDecision: "deny"` el modelo reintenta o sigue sin herramientas). Se aplica también a las herramientas de los Subagentes;
  - en `UserPromptSubmit`, rechaza los prompts nuevos (`decision: "block"`) mientras siga Superado;
  - cada parada se registra como **Bloqueo** con la regla `budget` y el motivo (ADR-0006), así que aparece en la pantalla de Bloqueos, en los carriles y en las métricas sin nada nuevo.
- **Cómo lo sabe el hook** (ADR-0010): el backend es quien conoce el coste, porque lo lee de los Transcripts. Después de evaluar las Reglas de bloqueo locales, el hook consulta `GET /api/v1/budgets/status?project=…&session=…` con un timeout corto (500 ms), y **falla abierto**: si Mandarina no responde, no detiene nada. El backend responde sin releer los Transcripts enteros, porque mantiene el coste acumulado de cada Sesión en memoria y solo lee lo que se ha añadido a su Transcript desde la última vez.
- **Margen**: la comprobación se hace antes de cada herramienta y de cada prompt, así que una Sesión puede pasarse del límite en lo que cueste la respuesta en curso. Además, el coste es una estimación (ADR-0005). La UI lo dice.
- **Seguir de todos modos**: desde el aviso o desde la pantalla, la persona usuaria puede **ampliar** el límite, o **permitir** el ámbito concreto que se superó (esa Sesión, o ese Proyecto hasta el fin del día) sin cambiar el Presupuesto. La excepción se guarda y se ve en la pantalla.
- **Dónde se ve**:
  - **Pantalla Presupuestos** (`/presupuestos`, grupo nuevo *Configurar* del menú lateral): alta, edición, desactivación y borrado de Presupuestos, cada uno con su estado, lo gastado, el límite y las excepciones vigentes. Es la primera configuración que se edita desde la UI, y va en el servidor (SQLite) porque es el servidor quien calcula el coste. Las Reglas de bloqueo siguen en el hook hasta 2.6;
  - la ficha **Coste estimado** del board muestra el progreso frente al presupuesto global por día, si existe;
  - la tarjeta de una Sesión detenida por presupuesto lleva un badge.
- Fuera de alcance: presupuestos por semana o por mes, por persona desarrolladora (7.1), por Tipo de Subagente o por modelo; presupuestos de tokens o de Turnos (el de las tareas headless sigue en 6.6); y avisos por webhook o correo (7.3).

### 1.16 Alerta visual y sonora cuando una Sesión espera a la persona usuaria

Con varias Sesiones abiertas, un agente puede llevar minutos parado esperando un permiso o una respuesta sin que nadie lo vea. El dashboard tiene que avisar, aunque la persona usuaria esté en otra pantalla o en otra pestaña. Adelanta al MVP la parte de detección y aviso de 1A.1; la bandeja, las notificaciones del sistema y la métrica de fricción siguen allí.

- **Cuándo espera una Sesión**: hay un Turno en curso y el agente no puede seguir sin la persona usuaria:
  - pide **permiso** para usar una herramienta (hooks `Notification` con motivo de permiso y `PermissionRequest`);
  - hace una **pregunta** (herramienta `AskUserQuestion` sin respuesta todavía);
  - lleva un rato **inactivo esperando input** (`Notification` con motivo de inactividad).
  Deja de esperar con el siguiente Evento de esa Sesión (la herramienta se ejecuta, se rechaza o llega un prompt nuevo). El fin de un Turno (`Stop`) no es esperar: la Sesión pasa a *En pausa* y no avisa. Capturar `Notification` y `PermissionRequest` implica Tipos de evento nuevos (ADR que amplíe ADR-0002) y registrarlos en el Adaptador.
- **Actividad Esperando** de la Sesión, distinta de *En pausa*, con badge destacado en su tarjeta del board y en el detalle de Sesión, y el motivo (herramienta y comando que pide permiso, o la pregunta). Si el que espera es un Subagente, el aviso lo dice y enlaza a su Sesión.
- **Alerta visual**: aviso destacado en la cabecera, visible desde cualquier pantalla, con el número de Sesiones que esperan y un enlace a la que más tiempo lleva esperando. Mientras haya alguna, el título de la pestaña lleva un contador (p. ej. `(2) Mandarina`) y el favicon cambia, para verlo desde otra pestaña.
- **Alerta sonora**: un sonido corto al pasar una Sesión a *Esperando*, distinto del de los Presupuestos (1.15). Mismo mecanismo que allí: Web Audio generado en el navegador, solo si la persona usuaria ya ha interactuado con la página (política de autoplay) y con un interruptor de silencio que se guarda en el navegador. No se repite en bucle; si la Sesión sigue esperando, vuelve a sonar como mucho cada pocos minutos.
- **Datos**: el cambio de Actividad llega por el WebSocket; `GET /sessions` y el detalle de Sesión exponen la Actividad *Esperando* y su motivo.
- Fuera de alcance: notificaciones del sistema operativo (Notification API) y configuración por Proyecto (1A.1), responder o aprobar el permiso desde el dashboard (6.5) y avisar al terminar un Turno.

**Stack típico usado por estos proyectos:** servidor en Bun/TypeScript o Python (uv), SQLite, cliente Vue 3 o React, comunicación por WebSocket.

## 1A. Fase 1A — Observabilidad accionable (después del MVP)

El MVP responde a *qué están haciendo los agentes*. Esta fase responde a *qué tengo que hacer yo ahora* y a *qué salió de cada Sesión*. Casi todo se deriva de Eventos que ya llegan o de los Transcripts, así que reutiliza el pipeline sin cambiar la arquitectura.

### 1A.1 Atención requerida: Sesiones que esperan a la persona usuaria

Es el caso de uso diario más frecuente con varias Sesiones abiertas: un agente lleva minutos parado esperando un permiso y nadie lo ve. La captura de `Notification` y `PermissionRequest`, la Actividad **Esperando** y la alerta visual y sonora se adelantan al MVP (1.16); aquí queda lo demás.

- Ficha propia de Sesiones esperando en el board.
- Bandeja **Atención requerida** en la cabecera con las Sesiones que esperan, ordenadas por tiempo de espera, con el motivo (herramienta y comando que pide permiso).
- Notificaciones del navegador (Notification API) opcionales y configurables por Proyecto, para no tener que mirar el dashboard.
- Métrica de fricción: tiempo total que los agentes pasan esperando permiso, por Proyecto y por herramienta. Alimenta las recomendaciones de allowlist de 2.7.

### 1A.2 Cambios de código por Sesión

Hoy se ve qué herramientas se usaron, pero no *qué cambió en el repositorio*.

- Pestaña **Cambios** en el detalle de Sesión: ficheros tocados (`Edit`, `Write`, `MultiEdit`, `NotebookEdit`) con el número de ediciones, líneas añadidas/eliminadas aproximadas y el diff de cada edición leído del payload.
- Commits y PRs creados en la Sesión, detectados en los `tool.post` de `Bash` (`git commit` → hash y mensaje; `gh pr create` → URL), derivados al consultar como las Ejecuciones de tests (ADR-0007).
- Mapa de calor de ficheros por Proyecto: qué ficheros tocan más los agentes y cuántas Sesiones distintas los han editado (señal de zonas inestables o mal especificadas).
- Enlace inverso: desde un fichero, las Sesiones que lo modificaron.

### 1A.3 Visor de la conversación y del contexto

- Pestaña **Conversación** en el detalle de Sesión: los mensajes del Transcript (prompts, respuestas de texto del agente, llamadas a herramientas plegadas), leído bajo demanda (ADR-0003).
- Capturar `PreCompact` para marcar las compactaciones del contexto (manuales y automáticas) en la línea de tiempo; una Sesión que compacta a menudo es candidata a partirse o a mejorar su `CLAUDE.md`.
- Gráfica de evolución del % de contexto ocupado a lo largo de la Sesión, con las compactaciones marcadas.

### 1A.4 Detección de fricción y anomalías

- **Bucles**: el mismo comando o la misma Ejecución de tests fallando N veces seguidas en un Turno; el mismo fichero editado y revertido.
- **Tasa de fallo por herramienta**: `tool.post` con error frente al total, por herramienta y Proyecto.
- **Turnos anómalos**: Turnos mucho más largos o caros que la mediana del Proyecto.
- **Final en rojo**: Sesiones que terminan con los tests fallando tras haberlos tocado.
- Se muestran como badges en el board y en una lista filtrable; umbrales configurables. Son avisos, no Bloqueos.

### 1A.5 Servidores MCP

- Pasa al MVP como **1.9**. Queda para después, con 1A.4, avisar de servidores lentos que alargan los Turnos o que fallan seguidos, y, con el catálogo de 2.1, detectar servidores configurados que nunca se usan.

### 1A.6 Búsqueda global, favoritas y enlaces

- Búsqueda de texto completo sobre prompts, comandos, rutas de fichero, resúmenes y notas de las Evaluaciones (SQLite FTS5), accesible con `Ctrl/⌘ K` (ya prevista en `spec/design.md`).
- Sesiones marcadas como favoritas. Las etiquetas y notas pasan al MVP como parte de la Evaluación (**1.12**).
- Enlaces permanentes a una Sesión, un Turno o un Evento para compartirlos.

### 1A.7 Salud de la ingesta y del Adaptador

El Adaptador es best-effort (ADR-0004): si el servidor no responde, el Evento se pierde en silencio. Hoy no hay forma de saber cuántos se han perdido.

- Por Directorio: último Evento recibido, versión del Adaptador y `schema_version`, y latencia entre `occurred_at` y `received_at`.
- Contador de Eventos descartados que el Adaptador guarda en local y envía con el siguiente Evento que sí llegue.
- Detección de instalaciones incompletas: llegan `tool.post` sin `session.started`, o nunca llega `turn.ended` (falta registrar un hook).
- Opcional: cola local en el host para reenviar lo que no llegó. Matiza ADR-0004, así que necesita un ADR propio.

### 1A.8 Importación del historial previo

- Importar las Sesiones que ya existen en los Transcripts de `~/.claude/projects` (ya montado en solo lectura, ADR-0003), incluidas las anteriores a instalar el Adaptador.
- Las Sesiones importadas se marcan como tales: tienen tokens, coste, herramientas y prompts, pero no Bloqueos ni Eventos que solo existen en los hooks.
- Aporta valor desde el primer arranque: el board y las métricas no empiezan vacíos.

### 1A.9 Retención y gestión de los datos

- Política de retención configurable (por antigüedad o tamaño de la base de datos); el MVP la tiene indefinida.
- Purga de un Proyecto o de una Sesión, y exportación/importación de Sesiones en JSON.
- Tamaño de la base de datos visible en una pantalla de ajustes y copia de seguridad del volumen documentada.
- Límite de tamaño por payload (salidas de `Bash` enormes) con truncado explícito, para que la base de datos no crezca sin control.

### 1A.10 Resúmenes automáticos (opt-in)

- Título y resumen de cada Sesión y de cada Turno generados con un modelo barato (Haiku) al cerrarse, para reconocer las Sesiones en el board sin abrirlas.
- Resumen diario o semanal por Proyecto: qué se hizo, qué quedó a medias, qué falló.
- Desactivado por defecto: envía contenido de los Transcripts al proveedor. Su propio coste se muestra aparte del de las Sesiones.

### 1A.11 Mandarina como servidor MCP (solo lectura)

- Exponer consultas de Mandarina como herramientas MCP para que los propios agentes consulten su historial: Sesiones recientes del Proyecto, qué se intentó y falló, Estado de los tests, ficheros más tocados, coste acumulado.
- Ejemplo: al empezar una Sesión, el agente pregunta "¿qué se hizo ayer en este Proyecto y qué quedó pendiente?".
- Solo lectura en esta fase; las acciones van en la Fase 6.

---

## 2. Fase 2 — Gestión de skills, comandos y plugins

### 2.0 Prerrequisito: acceso a la configuración de cada Directorio

El backend corre en Docker y solo ve `~/.claude` (ADR-0003), no las `.claude/`, `CLAUDE.md` ni `.mcp.json` de cada Directorio. Toda la Fase 2 depende de resolverlo antes, con un ADR:

- **Opción A**: montar en solo lectura las carpetas de código del host (sencillo, pero acopla el `docker-compose.yml` a cada máquina).
- **Opción B**: que el Adaptador envíe una instantánea de la configuración del Directorio (skills, agentes, comandos, hooks, MCP) al empezar cada Sesión o cuando cambie su hash. Encaja con el modelo multi-harness y no necesita volúmenes.
- Escribir desde la UI (editar skills, reglas o settings) es otro problema: con la opción B hace falta un componente en el host que aplique los cambios, lo que acerca esta fase a la capa de orquestación.

### 2.1 Explorador de configuración

- Árbol de archivos con vista previa markdown de toda la knowledge base del proyecto (`.claude/`, `CLAUDE.md`, memorias, reglas).
- Visor de skills disponibles: nombre, descripción, cuándo se dispara (trigger), archivo `SKILL.md` completo.
- Visor de comandos slash disponibles (`/comando`) con su definición.
- Visor de subagentes definidos, con modal mostrando el prompt completo de cada uno.
- Visor de reglas del proyecto (estándares de código, reglas de seguridad, guías de workflow).
- Visor de servidores MCP configurados (global, por Proyecto y por plugin) con sus herramientas.
- Cruce catálogo × uso: cada skill, agente, comando y servidor MCP con sus métricas de uso de la Fase 1 (1.6, 1.7, 1A.5), para ver lo que nunca se dispara.

### 2.2 Gestor de marketplaces y plugins

- Listado de marketplaces registrados (`/plugin marketplace add`) y plugins instalados desde ellos.
- Metadata por plugin: versión, autor, qué incluye (skills / hooks / agentes / comandos / servidores MCP).
- Acción de instalar/actualizar/desinstalar plugins desde la propia UI (llamando al CLI de Claude Code por debajo).
- Detección de conflictos entre plugins (dos skills con triggers solapados, hooks duplicados).

### 2.3 Editor y evaluador de skills (skill-creator loop)

- Editor de `SKILL.md` con validación de formato.
- Banco de prompts de prueba para medir si una skill se dispara cuando debería (trigger accuracy).
- Comparación lado a lado: respuesta del agente **con** la skill vs. **sin** la skill, sobre el mismo prompt.
- Métricas de benchmark a lo largo del tiempo (¿mejoró la skill tras el último cambio de descripción?).
- Optimizador asistido de la descripción de la skill (la descripción es lo que determina cuándo se activa).

### 2.4 Inspector de memoria

- Vista por proyecto de los archivos de memoria (`MEMORY.md` o equivalente).
- Búsqueda cruzada entre proyectos ("¿en qué proyecto anoté esto?").
- Diff de cambios de memoria entre sesiones.

### 2.5 Gestor de settings y variables de entorno

- Vista y edición de hooks configurados, con qué evento disparan y qué script ejecutan.
- Vista de variables de entorno usadas por el proyecto (sin exponer secretos en claro).
- Configuración a nivel de proyecto vs. a nivel global (`~/.claude/` vs. `.claude/` del repo).

### 2.6 Editor de Reglas de bloqueo

`mvp-fase1.md` deja la edición de Reglas de bloqueo para la Fase 2; hoy solo se editan en `adapters/claude-code/rules.json`.

- Alta, edición y desactivación de reglas desde la UI, globales o por Proyecto.
- **Modo auditoría**: una regla nueva puede solo avisar (registrar lo que habría bloqueado) antes de pasar a bloquear.
- **Prueba en seco** contra el historial: "¿qué habría bloqueado esta regla en los últimos 7 días?", evaluada sobre los `tool.pre` guardados.
- Estadísticas por regla: Bloqueos, falsos positivos marcados por la persona usuaria, última vez que saltó.
- Las reglas siguen evaluándose en el hook (ADR-0004); el Adaptador descarga la versión vigente del servidor y guarda copia local para seguir funcionando si el servidor no responde.

### 2.7 Recomendaciones de configuración

Convertir lo observado en cambios concretos de configuración, siempre como propuesta que la persona usuaria acepta:

- **Permisos**: comandos que se aprueban a mano una y otra vez (1A.1) → entrada para la allowlist de `settings.json`.
- **CLAUDE.md**: instrucciones que se repiten en muchos prompts ("responde en español", "usa Vitest") → moverlas a `CLAUDE.md`.
- **Modelo**: Subagentes o skills caros con tareas repetitivas → probar un modelo más barato (con los datos de 1.8).
- **Limpieza**: skills, agentes y servidores MCP que nunca se usan (2.1).
- **Hooks lentos**: hooks que alargan cada llamada a herramienta.

---

## 3. Fase 3 — Gobernanza basada en Git y políticas de equipo

Se trata de llevar el control a donde los equipos ya colaboran, el repositorio de código, en lugar de saltar a arquitecturas multiusuario complejas o a SSO en la nube. La autenticación y el multiusuario (7.1) quedan para cuando de verdad haga falta un servidor compartido.

### 3.1 Políticas compartidas en el repo

- Reglas de presupuesto (1.15), umbrales de parada y patrones de enmascarado de PII (1.13) definidos en un fichero de configuración versionado en la raíz del Proyecto (p. ej. `mandarina.yaml`). Quien clona el repositorio ya lleva la gobernanza integrada.
- Precedencia clara entre la política del repo y los ajustes locales de cada persona: la política del repo fija el mínimo y lo local solo puede endurecerlo, no relajarlo.
- Necesita un ADR propio: el backend en Docker no ve el repo de cada Directorio (2.0), así que el fichero lo lee el Adaptador en el host o se monta en solo lectura.

### 3.2 Auditoría de IA en Pull Requests

- Hook para GitHub Actions o GitLab CI que lee los resúmenes locales de Mandarina y añade un comentario automático en el PR con el coste en tokens, el uso de caché (1.14) y los riesgos de seguridad detectados (Bloqueos y Avisos de inyección, 1.13) durante esa rama.
- Sustituye a un panel web multiusuario corporativo: el resumen viaja con la rama y se revisa en el propio PR.
- Depende de los cambios de código por Sesión (1A.2) para asociar Sesiones a ramas y commits.

### 3.3 Métricas agregadas anónimas

- Exportar un resumen semanal de ahorro y eficiencia para compartirlo en las reuniones de equipo, sin exponer código fuente ni datos sensibles: solo agregados (coste, caché, Sesiones, Bloqueos), sin prompts, rutas ni nombres de persona.
- Opt-in y con vista previa de lo que se exportaría (§9, privacidad por defecto).

---

## 4. Fase 4 — Federación local y ecosistema de plugins

Se apuesta por un modelo modular y abierto, en lugar de una orquestación cruzada rígida entre agentes de terceros.

### 4.1 Marketplace de skills y hooks locales

- Gestor dentro del Cockpit para instalar, actualizar y probar prompts del sistema (`CLAUDE.md`), skills y filtros de seguridad creados por la comunidad o por el propio equipo de ingeniería.
- Se apoya en el acceso a la configuración de cada Directorio (2.0) y en el gestor de marketplaces y plugins (2.2).

### 4.2 Red de agentes locales (mesh local)

- Si varias personas desarrolladoras del mismo equipo usan agentes en su red local (LAN), pueden compartir de forma peer-to-peer (P2P) aprendizajes sobre qué prompts funcionan mejor o qué bucles evitar, sin depender de servidores en la nube.
- Usa como base las Evaluaciones (1.12) y la detección de fricción (1A.4); lo que se comparte es opt-in y va enmascarado.

### 4.3 APIs abiertas para CI/CD

- Exponer una API local robusta para que herramientas de testing o despliegue internas interactúen con el estado de los agentes (Sesiones, Bloqueos, Presupuestos, resultado de los tests).
- Parte de la API REST y el WebSocket ya existentes (`specs/api-spec.yaml`); habrá que versionar lo público y decidir su autenticación (7.1).

---

## 5. Fase 5 — Reporting y auditoría

- **Dashboard de uso histórico** ("espejo retrovisor"): tendencias de uso, sesiones por día, coste por semana.
- **Vista "cockpit"** de la sesión en curso: lo que está pasando ahora mismo, en tiempo real.
- **Exportación de informes** en varios formatos:
  - HTML autocontenido con diagramas Mermaid y gráficos Chart.js.
  - Markdown portable (para pegar en PRs o chats de equipo).
  - Artifact publicable con link compartible.
- **Auditoría de plugins instalados**, diffs de git y documentación del proyecto, con verificación visual automática del propio informe antes de entregarlo (renderizarlo y revisarlo como imagen para detectar diagramas rotos).
- **Comparador de Sesiones**: dos o más Sesiones lado a lado (modelo, Harness, coste, Duración activa, herramientas, Bloqueos, resultado de los tests). Es la vista que materializa la comparación multi-harness de 0.5 ("Claude Code con Sonnet en 4 min frente a Codex en 7 min").
- **Trazabilidad de criterios de aceptación**: para Proyectos que citan `AC-*` en sus tests, qué criterios tienen tests que pasan, cuáles fallan y cuáles no tienen ningún test, con la Sesión que los tocó por última vez (a partir de 1.5).
- **Registro de auditoría**: quién cambió qué regla, qué plugin se instaló, qué permiso se aprobó desde el dashboard (con 2.6, 2.2 y 6.5).

---

## 6. Fase 6 — Orquestación multi-agente

Reubicada desde la antigua Fase 3 al rediseñar las Fases 3 y 4 (gobernanza en Git y ecosistema local). Se conserva íntegra y se retoma según lo pida el flujo diario.

### 6.1 Gestión de equipos de agentes

- Crear un "equipo": capa de coordinación + lista de tareas centralizada compartida entre agentes.
- Desplegar agentes especializados (builder, validator, reviewer...) cada uno con su propia ventana de contexto y sesión, en paneles/procesos aislados.
- Comunicación entre agentes vía mensajería (`SendMessage` o equivalente).
- Apagado ordenado de agentes al completar su tarea y limpieza del estado del equipo al terminar.

### 6.2 Ejecución paralela a escala

- Lanzamiento de N agentes en paralelo (proyectos de referencia llegan a 20–50) usando tmux u otro multiplexor de procesos.
- Auto-reinicio de un agente que termina su tarea o se queda atascado/con error.
- Monitor de salud por agente: % de contexto usado, si está "trabajando" o "parado", errores recientes.
- **Worktrees aislados de git**: cada agente trabaja en su propia rama/directorio para no pisarse con otros agentes que tocan el mismo repo.

### 6.3 Delegación entre harnesses

- Posibilidad de delegar una tarea concreta a otro CLI/agente (Codex, OpenCode, etc.) y capturar el resultado de vuelta al flujo principal.
- Útil para pedir una "segunda opinión" o una revisión cruzada entre modelos/herramientas distintas.

### 6.4 Modo swarm avanzado

- Memoria persistente compartida entre agentes del swarm.
- Federación entre marketplaces/equipos de distintos proyectos.
- Hooks disparados vía servidores MCP conectados al swarm.

### 6.5 Persona en el bucle desde el dashboard

Primer paso de control, de bajo riesgo y alto valor, antes que lanzar agentes:

- Aprobar o denegar desde el dashboard (o el móvil) las peticiones de permiso de 1A.1: el hook `PermissionRequest` consulta al servidor y espera la decisión con un tiempo límite; si no hay respuesta, cae al prompt local de siempre.
- Choca con el hook best-effort y rápido de ADR-0004, así que necesita un ADR propio (tiempo límite, qué pasa sin servidor, autenticación de quien aprueba).

### 6.6 Lanzador de tareas headless

Lo que las Agent Teams nativas no cubren: lanzar y programar trabajo sin abrir un terminal.

- Lanzar desde la UI una Sesión headless (`claude -p` o Claude Agent SDK) a partir de una plantilla: prompt, skill o agente, modelo, Directorio y, opcionalmente, un worktree aislado.
- Cola de tareas con programación (cron) y presupuesto máximo de coste o de Turnos por tarea; la tarea se corta al superarlo.
- La Sesión lanzada se observa por el mismo pipeline que cualquier otra y queda enlazada a su tarea y su resultado (commits, tests, respuesta final).
- Necesita un componente en el host (ver 2.0): el backend en Docker no puede lanzar el Harness de la máquina.

---

## 7. Fase 7 — Tracing, costes y nivel "producción"

Reubicada desde la antigua Fase 4. Autenticación y multiusuario (7.1) es ahora el paso para desplegar en un servidor compartido, y las Fases 3 y 4 no dependen de ello.

Esta capa es la que diferencia una herramienta de desarrollador de una herramienta lista para equipos/empresa:

- **Tracing de llamadas LLM**: qué prompt exacto se envió, qué respondió el modelo, latencia.
- **Tracking de llamadas a herramientas**: qué tool se invocó, con qué input, cuánto tardó, si falló.
- **Coordinación multi-agente**: quién delegó qué a quién y en qué orden.
- **Seguimiento de coste por tokens**: coste acumulado por sesión, por proyecto, por agente, con alertas de presupuesto.
- **Pruebas A/B de prompts/skills**: comparar variantes de un mismo prompt o skill sobre el mismo conjunto de tareas.
- **Guardrails**: reglas que detectan comportamiento anómalo o fuera de política antes de que el agente actúe.
- **Trazado de decisiones**: por qué el agente eligió una herramienta u otra en un punto dado.
- **Integraciones con observabilidad estándar de la industria**: las trazas OTLP (Jaeger, Tempo, Datadog, Langfuse, Arize Phoenix) pasan al MVP como **1.11**. Quedan aquí las métricas y logs OTLP y las integraciones que no hablan OTLP (LangSmith, Sentry).
- **Guías por framework**: si el agente usa LangChain, LangGraph, Claude Agent SDK, CrewAI, AutoGen, Pydantic AI, etc., adaptar la instrumentación a cada uno.

### 7.1 Autenticación y multiusuario

Hoy la API y el WebSocket no tienen autenticación: basta en `localhost`, pero es lo primero que hace falta para desplegarlo en un servidor compartido.

- Token de ingesta por Adaptador (o por persona desarrolladora), revocable, enviado en cada Evento.
- Inicio de sesión en el dashboard (SSO/OIDC en entorno de empresa) y roles: ver solo mis Sesiones, ver las del equipo, administrar reglas.
- Persona desarrolladora como dimensión del Evento y filtro del board y de las métricas.
- Enmascarado configurable además del de secretos y PII (1.13): rutas personales, datos de clientes.
- Migración a Postgres cuando haya varias personas escribiendo a la vez (ya prevista en 0.6).

### 7.2 Métricas de resultado

El coste solo tiene sentido frente a lo que se obtuvo:

- Coste y Duración activa por commit, por PR creado y por test que pasa de rojo a verde (con 1A.2 y 1.5).
- Tasa de Sesiones que terminan con los tests en verde y sin Bloqueos.
- Comparativa por modelo, agente y skill de coste frente a resultado, no solo de coste.

### 7.3 Presupuestos y alertas

- Los Presupuestos por Sesión, por Proyecto y día y globales por día, con aviso y parada del agente, pasan al MVP como **1.15**. Quedan aquí los presupuestos por persona desarrolladora (con 7.1) y por semana o mes.
- Canales de alerta: webhook genérico (Slack, Teams) y correo; la notificación del navegador va con 1A.1.
- Alertas también sobre las anomalías de 1A.4 y sobre la salud de la ingesta de 1A.7.

---

## 8. Matriz de priorización sugerida

| Funcionalidad | Valor | Complejidad | Fase |
| --- | --- | --- | --- |
| Esquema de eventos normalizado (multi-harness) | Alto (evita reescribir todo después) | Baja si se hace desde el inicio | 0.5 (transversal) |
| Ingesta de hooks + dashboard en vivo | Alto | Media | 1 (MVP) |
| Panel de detalle de sesión (tokens/contexto) | Alto | Baja | 1 (MVP) |
| Visor de estado de tests unitarios y E2E | Alto | Media | 1 (MVP) |
| Uso de skills en las Sesiones | Medio-Alto | Baja | 1 (MVP) |
| Visibilidad completa de los Subagentes | Alto | Baja-Media | 1 (MVP) |
| Desglose por Directorio y por modelo de las fichas del board | Medio-Alto | Baja-Media | 1 (MVP) |
| Observador de servidores MCP (uso, fallos, latencia, tamaño de respuesta) | Medio-Alto | Baja-Media | 1 (MVP) |
| Observador de agentes (perfil por Tipo, delegación, resultado y coste) | Alto | Media | 1 (MVP) |
| Exportación OTLP de las trazas con OpenInference (opt-in) | Medio-Alto | Media | 1 (MVP) |
| Evaluación humana (puntuación, etiquetas, notas) y dataset de evals | Alto | Baja-Media | 1 (MVP) |
| Enmascarado de secretos y PII en origen, y Avisos de inyección | Alto | Media | 1 (MVP) |
| Eficiencia de la caché de prompts (tasa, ahorro neto, reescrituras) | Medio-Alto | Baja-Media | 1 (MVP) |
| Presupuestos con aviso y parada del agente | Alto | Media | 1 (MVP) |
| Alerta visual y sonora cuando una Sesión espera a la persona usuaria | Muy alto | Baja-Media | 1 (MVP) |
| Atención requerida (bandeja, notificaciones del sistema, fricción) | Alto | Baja-Media | 1A |
| Importación del historial previo desde los Transcripts | Alto | Media | 1A |
| Cambios de código por Sesión (ficheros, commits, PRs) | Alto | Media | 1A |
| Salud de la ingesta y del Adaptador | Medio-Alto | Baja | 1A |
| Detección de fricción y anomalías (bucles, fallos) | Medio-Alto | Media | 1A |
| Visor de la conversación y compactaciones | Medio | Baja-Media | 1A |
| Búsqueda global, favoritas y enlaces | Medio | Media | 1A |
| Avisos de servidores MCP lentos o que fallan seguidos | Medio | Baja | 1A |
| Retención y gestión de los datos | Medio | Baja | 1A |
| Mandarina como servidor MCP (solo lectura) | Medio | Baja-Media | 1A |
| Resúmenes automáticos con LLM (opt-in) | Medio | Baja | 1A |
| Acceso a la configuración de cada Directorio (prerrequisito) | Alto (desbloquea la Fase 2) | Media | 2.0 |
| Explorador de skills/comandos/plugins | Alto | Baja | 2 |
| Editor de Reglas de bloqueo con modo auditoría y prueba en seco | Medio-Alto | Media | 2 |
| Recomendaciones de configuración | Alto | Media | 2 |
| Editor + benchmark de skills | Medio-Alto | Media | 2 |
| Gestor de marketplaces/plugins | Medio | Media | 2 |
| Políticas compartidas en el repo (`mandarina.yaml`: presupuestos, umbrales, enmascarado) | Alto | Media | 3 |
| Auditoría de IA en Pull Requests (comentario en el PR desde CI) | Alto | Media | 3 |
| Métricas agregadas anónimas (resumen semanal exportable) | Medio | Baja | 3 |
| Marketplace de skills y hooks locales | Medio | Media-Alta | 4 |
| Red de agentes locales (mesh P2P en LAN) | Medio-Bajo (nicho) | Alta | 4 |
| APIs abiertas para CI/CD | Medio-Alto | Media | 4 |
| Orquestación de equipos de agentes | Alto (si tu caso de uso lo pide) | Alta | 6 |
| Ejecución paralela a escala (20+) | Medio (nicho) | Alta | 6 |
| Persona en el bucle (aprobar permisos desde el dashboard) | Alto | Media-Alta | 6 |
| Lanzador de tareas headless con cola y presupuesto | Medio-Alto | Alta | 6 |
| Tracing/costes nivel producción | Alto (si es para equipos) | Alta | 7 |
| Autenticación y multiusuario | Alto (imprescindible fuera de `localhost`) | Media | 7 |
| Métricas de resultado (coste por commit/PR/test) | Alto | Media | 7 |
| Presupuestos por persona y periodo, y alertas por webhook o correo | Medio | Baja-Media | 7 |
| Reporting exportable | Medio | Media | 5 |
| Comparador de Sesiones | Medio-Alto | Baja-Media | 5 |
| Trazabilidad de criterios de aceptación | Medio | Media | 5 |

---

## 9. Consideraciones técnicas transversales

- **No reinventes la orquestación nativa**: antes de construir la Fase 6, evalúa si las Agent Teams nativas de Claude Code ya cubren el caso de uso — es la lección explícita de claude-activity-viewer.
- **SQLite como almacén por defecto**: todos los proyectos de referencia lo usan por simplicidad de despliegue local; considera Postgres solo si vas a multiusuario/multi-equipo. Con Node.js, `better-sqlite3` es la opción más común para esto.
- **WebSocket para tiempo real**, HTTP REST para consultas históricas/paginadas.
- **No expongas secretos**: al mostrar variables de entorno o payloads de eventos, enmascara tokens/API keys.
- **Empaquétalo como plugin de Claude Code** (con `.claude-plugin/plugin.json` y opcionalmente `marketplace.json`) para que se instale con `/plugin install`, en vez de requerir un setup manual — es el patrón que siguen casi todos los proyectos más recientes. Encaja con 0.7: el plugin instala el **Adaptador** (hooks) en el host; el servidor y el dashboard siguen distribuyéndose como imágenes Docker.
- **Rendimiento con volumen**: índices por Sesión, Proyecto y momento; agregados precalculados para las fichas del board cuando la tabla de Eventos crezca; paginación por cursor y scroll virtual en las listas largas. Fijar un objetivo medible (p. ej. board en < 1 s con 1 M de Eventos).
- **Versionado del Evento**: `schema_version` ya viaja en cada Evento; definir cómo convive el servidor con Adaptadores de versiones anteriores y cómo se migran los datos guardados.
- **Privacidad por defecto**: todo local; cualquier funcionalidad que envíe datos fuera (resúmenes con LLM, integraciones de la Fase 7, alertas por webhook) es opt-in y se indica en la UI.
- **La observación nunca rompe el trabajo**: ninguna funcionalidad nueva puede hacer que el hook bloquee o ralentice al agente más allá de su tiempo límite (ADR-0004); las que lo necesiten (1.15, 6.5) lo justifican en un ADR.

---

## 10. Próximos pasos concretos

Hecho (ver `mvp-fase1.md`): esquema de Evento, ingesta + SQLite + WebSocket, board, detalle de Sesión, Bloqueos, Estado de los tests y uso de skills.

1. Cerrar la Fase 1: rebanada 3b y los puntos 1.11 a 1.16 (exportación OTLP, evaluación humana, enmascarado y Avisos de inyección, caché de prompts, presupuestos y alerta de Sesiones que esperan). 1.16 (Sesiones que esperan) está hecha; `PreCompact` queda para 1A.3.
2. Atención requerida (1A.1): bandeja, notificaciones del sistema y métrica de fricción sobre la Actividad *Esperando* de 1.16.
3. Importación del historial previo (1A.8) y salud de la ingesta (1A.7), para que los datos estén completos y sean fiables.
4. Cambios de código por Sesión (1A.2) y detección de fricción (1A.4).
5. Decidir en un ADR el acceso a la configuración de cada Directorio (2.0) antes de empezar la Fase 2; lo necesitan también las políticas en el repo (3.1).
6. Empaquetar el Adaptador como plugin instalable vía marketplace.
7. Iterar hacia la Fase 2 según qué falte más en el flujo diario.