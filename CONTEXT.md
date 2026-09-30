# Mandarina

Aplicación web para observar (y, en fases posteriores, gestionar y orquestar) lo que hacen los agentes de código —Claude Code primero, otros harness después— en los proyectos de quien la usa.

## Language

### Origen de los datos

**Harness**:
Herramienta de agentes de código cuya actividad se observa (Claude Code, Codex CLI, OpenCode…).
_Avoid_: Herramienta, CLI, cliente

**Adaptador**:
Pieza que traduce los hooks nativos de un Harness al Evento normalizado de Mandarina; hay uno por Harness.
_Avoid_: Plugin, conector

**Proyecto**:
Agrupación lógica de Sesiones con un nombre elegido por quien configura el Adaptador (p. ej. `mandarina`); si no se configura, se toma el nombre de la carpeta raíz.
_Avoid_: source_app, app, repo

**Directorio**:
Carpeta de trabajo concreta en la que corre una Sesión; un Proyecto puede tener Sesiones en varios Directorios.
_Avoid_: cwd, ruta, workspace

**Transcript**:
Registro completo que el propio Harness guarda de una Sesión; Mandarina lo lee bajo demanda, no lo copia.
_Avoid_: Historial, chat log

### Sesiones

**Sesión**:
Una ejecución de un Harness, identificada por el propio Harness, dentro de un Proyecto y un Directorio.
_Avoid_: Conversación, chat, run

**Subagente**:
Ejecución delegada dentro de una Sesión, con su propio contexto; sus Eventos pertenecen a la vez al Subagente y a su Sesión. No es una Sesión aparte.
_Avoid_: Agente hijo, sub-sesión

**Tarea del Subagente**:
Encargo con el que el agente principal delega en un Subagente: una descripción corta y el prompt completo. El Subagente la resuelve con sus propias herramientas y termina devolviendo una respuesta.
_Avoid_: Task, encargo, job

**Turno**:
Tramo de una Sesión que va desde que el usuario envía un prompt hasta que el agente termina de responder.
_Avoid_: Interacción, ronda, stop

**Duración activa**:
Suma de las duraciones de los Turnos de una Sesión; los huecos entre Turnos son pausas y no cuentan.
_Avoid_: Tiempo honesto, tiempo real

**Duración de reloj**:
Tiempo transcurrido entre el primer y el último Evento de una Sesión, pausas incluidas.
_Avoid_: Duración total

**Estado de la Sesión**:
Situación de liveness de una Sesión: **Activa** (actividad reciente o Turno en curso), **Inactiva** (sin actividad reciente pero sin indicios de haber muerto), **Huérfana** (sin actividad prolongada y sin haber cerrado; el proceso probablemente murió) o **Cerrada** (el Harness notificó su fin).
_Avoid_: Vivo, muerto, zombie

**Actividad de la Sesión**:
Qué está haciendo ahora una Sesión que no está Cerrada ni Huérfana: **Trabajando** (hay un Turno en curso), **En pausa** (no hay Turno en curso; espera un prompt del usuario) o **Esperando** (hay un Turno en curso pero el agente no puede seguir sin la persona usuaria: pide permiso para una herramienta, hace una pregunta o queda inactivo esperando input; lleva su motivo y, si es un Subagente, quién espera; ADR-0011). *Stop* no es esperar: tras `turn.ended` la Sesión está En pausa. Es independiente del Estado de la Sesión: una Sesión En pausa puede estar Activa o Inactiva.
_Avoid_: Ocupada, idle, parada

**Subagente en marcha**:
Subagente que ha empezado y aún no ha terminado, dentro de una Sesión que no está Cerrada ni Huérfana.
_Avoid_: Agente activo

**Lanzamiento**:
Invocación de la herramienta `Agent`/`Task` con la que el agente delega una Tarea en un Subagente de un Tipo de Subagente. Cada Subagente tiene como mucho un Lanzamiento; uno que aún no se ha enlazado con su Subagente es un Subagente pendiente.
_Avoid_: Spawn, invocación de agente, delegación

**Tipo de Subagente**:
Nombre del agente en que se delega una Tarea: uno integrado en el Harness (`Explore`, `Plan`…) o uno definido en `.claude/agents/` (`e2e-builder`…).
_Avoid_: agent_type, subagent_type, rol

**Subagente interno**:
Subagente que el Harness lanza para sí mismo (p. ej. para sugerir el siguiente prompt), no porque el agente delegue una Tarea: no tiene Tipo de Subagente, ni lanzamiento, ni actividad propia. No cuenta como Subagente de la Sesión.
_Avoid_: Auxiliar, de sistema, fantasma

### Eventos

**Evento**:
Hecho observado en una Sesión, expresado en el formato normalizado de Mandarina, independiente del Harness que lo originó.
_Avoid_: Hook, log, mensaje

**Tipo de evento**:
Categoría normalizada de un Evento (`session.started`, `tool.pre`, `tool.post`, `prompt.submitted`, `subagent.started`, `subagent.stopped`, `turn.ended`, `session.ended`, `tool.blocked`, `permission.requested`, `session.notified`); el nombre nativo del Harness se conserva aparte. `tool.blocked` es un Bloqueo (ADR-0006); `permission.requested` y `session.notified` son las peticiones de permiso y avisos del Harness (ADR-0011).
_Avoid_: hook_event_type, event name, session.stopped

### Consumo

**Uso de tokens**:
Tokens de entrada, de salida, de lectura de caché y de escritura de caché que el Transcript registra en cada respuesta del modelo, incluidas las de los Subagentes.
_Avoid_: Consumo, gasto

**Tarifa**:
Precio por millón de tokens de un modelo para cada clase de token (entrada, salida, lectura y escritura de caché).
_Avoid_: Precio, pricing

**Coste estimado**:
Uso de tokens multiplicado por la Tarifa de su modelo. Es una estimación: no es la factura del proveedor.
_Avoid_: Coste real, factura

**Tasa de acierto de caché**:
Parte de los tokens de entrada (entrada, lectura y escritura de caché) que se leyó de caché.
_Avoid_: Hit rate, eficiencia

**Ahorro por caché**:
Lo que la lectura de caché ahorró frente a la Tarifa de entrada, menos lo que se pagó de más por escribir en caché. Es neto y puede ser negativo.
_Avoid_: Descuento, ahorro real

**Reescritura de caché**:
Respuesta del modelo que vuelve a escribir en caché la mayor parte de su contexto en lugar de leerlo, con una causa probable: caducada, cambio de modelo, compactación u otra.
_Avoid_: Cache miss, fallo de caché

### Protección

**Regla de bloqueo**:
Criterio que decide si una invocación de herramienta es peligrosa y debe impedirse antes de ejecutarse.
_Avoid_: Guardrail, política, filtro

**Bloqueo**:
Invocación de herramienta impedida por una Regla de bloqueo, registrada con la regla que la impidió y el motivo.
_Avoid_: Rechazo, denegación

**Presupuesto**:
Límite de Coste estimado para un ámbito: cada Sesión, un Proyecto en el día o todos los Proyectos en el día. Al superarse, solo avisa o detiene al agente (ADR-0010).
_Avoid_: Budget, cuota, tope

**Estado del presupuesto**:
Situación de un Presupuesto frente a lo gastado: **Dentro**, **Cerca** (pasado su umbral de aviso) o **Superado**.
_Avoid_: Alerta, nivel

**Uso de la suscripción**:
Cuota que queda de la suscripción de Claude (Pro o Max) en dos ventanas, la de 5 horas y la semanal, con el momento en que se reinician. Es un dato de la cuenta, no de la Sesión, y llega por el `statusLine` de Claude Code (ADR-0012). Cada ventana está **Holgada**, **Cerca** (queda el 20 % o menos), **Agotada** o con el **reinicio pendiente** de una nueva lectura. Sin datos no hay suscripción.
_Avoid_: Créditos, límite de uso, rate limit

**Enmascarado**:
Sustitución de un secreto o un dato personal (PII) por un **Marcador** con su tipo (`[REDACTED_API_KEY]`, `[REDACTED_EMAIL]`) antes de enviarlo, guardarlo, mostrarlo o exportarlo (ADR-0009).
_Avoid_: Redacción, anonimización, censura

**Aviso de inyección**:
Señal de que el contenido leído por una herramienta (una web, un fichero, una respuesta MCP) parece dar órdenes al agente. Tiene severidad **alta**, **media** o **baja**, se puede descartar como falso positivo y nunca bloquea.
_Avoid_: Alerta, ataque, amenaza, detección

### Tests

**Ejecución de tests**:
Invocación de un runner de tests que un agente lanzó con `Bash` en una Sesión, con su resultado leído de la salida: pasados, fallidos, omitidos, duración y tests fallidos (ADR-0007).
_Avoid_: Test run, build, job, pipeline

**Tipo de tests**:
Clase de una Ejecución de tests: **Unitarios** (Vitest, Jest, `node:test`) o **E2E** (Playwright, o cualquier comando que nombre `e2e`).
_Avoid_: Suite, nivel

**Estado de los tests**:
Resultado de la última Ejecución de tests de cada Tipo de tests de un Proyecto: **Pasan**, **Fallan** o **Sin datos**.
_Avoid_: Salud, build status, CI

### Servidores MCP

**Servidor MCP**:
Servicio externo que ofrece herramientas al Harness a través del protocolo MCP, identificado por su nombre (`playwright`). Se configura en un **ámbito** (proyecto, usuario, local o plugin); el mismo nombre en varios ámbitos o Proyectos es el mismo Servidor MCP.
_Avoid_: Plugin, conector, integración

**Herramienta MCP**:
Herramienta que ofrece un Servidor MCP (`mcp__playwright__browser_navigate`). Usarla es una invocación de herramienta más, como las nativas del Harness.
_Avoid_: Comando, acción

### Skills

**Skill**:
Capacidad empaquetada que un agente carga bajo demanda, identificada por su nombre (`commit`, `plugin:skill`). Incluye los slash commands, sean propios o del Harness.
_Avoid_: Comando, plugin, herramienta

**Invocación de skill**:
Cada vez que una Sesión o un Subagente carga una Skill, ya sea porque la pidió el agente o porque la persona usuaria escribió `/nombre` al principio del prompt. Queda **En curso** hasta que termina el Turno (o el Subagente) en que se cargó, y pasa entonces a **Terminada**. Si no llegó a cargarse, queda **Fallida**.
_Avoid_: Uso, ejecución, disparo

### Evaluación humana

**Evaluación**:
Juicio que la persona usuaria deja sobre una Sesión, un Turno o un Subagente: una Puntuación, Etiquetas y una Nota, todas opcionales. Hay una por objeto evaluado. No es un Evento: no es un hecho observado en la Sesión.
_Avoid_: Feedback, anotación, review, rating

**Puntuación**:
Parte binaria de una Evaluación: **+1** (bien) o **−1** (mal), o sin puntuar.
_Avoid_: Calificación, estrellas, score, voto

**Etiqueta**:
Palabra libre, en minúsculas y con guiones, que clasifica una Evaluación (`hallucination`, `bug-fix`).
_Avoid_: Tag, categoría

**Nota**:
Texto libre de una Evaluación que explica el porqué de la Puntuación.
_Avoid_: Comentario, anotación

**Dataset de evaluación**:
Exportación JSONL de las Evaluaciones que pasan un filtro, con el prompt, la respuesta y el juicio de cada objeto evaluado.
_Avoid_: Evals, corpus, golden set

### Exportación

**Exportación OTLP**:
Envío opt-in de cada Turno terminado, como una traza OpenTelemetry con la convención OpenInference, a un colector externo (ADR-0008). Cada Turno queda **Pendiente**, **Exportado** o **Fallido**.
_Avoid_: Telemetría, sincronización, integración
