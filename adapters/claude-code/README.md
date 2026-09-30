# Adaptador de Claude Code

Script Node sin dependencias (`send_event.mjs`) que Claude Code ejecuta en cada hook y que envía a Mandarina el Evento normalizado (ver `spec/mvp-fase1.md`).

- Corre en **tu máquina**, no en Docker. Requiere Node ≥ 20.
- Es **best-effort** (ADR-0004): si Mandarina no responde, descarta el Evento y sale con código 0 en menos de 2,5 s. Nunca frena ni rompe Claude Code.
- Solo escribe en stdout para **bloquear** una invocación de herramienta que incumple una Regla de bloqueo (ver abajo). El resto de hooks no escriben nada.

## Instalación

Añade esto al `.claude/settings.json` del proyecto que quieras observar (o a `~/.claude/settings.json` para todos). Sustituye `<MANDARINA>` por la ruta absoluta de este repo, con `/` también en Windows:

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
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "node <MANDARINA>/adapters/claude-code/send_event.mjs" }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "node <MANDARINA>/adapters/claude-code/send_event.mjs" }] }],
    "PermissionRequest": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node <MANDARINA>/adapters/claude-code/send_event.mjs" }] }]
  }
}
```

`Notification` y `PermissionRequest` son los que permiten a Mandarina saber qué Sesiones esperan a la persona usuaria (ADR-0011): `PermissionRequest` se envía como `permission.requested` (diálogo de permiso de una herramienta) y `Notification` como `session.notified` (permiso pendiente, inactividad…). Solo observan: no aprueban, no deniegan ni retrasan el diálogo, no evalúan Reglas ni Presupuestos y no escriben en stdout. Su `message` y `tool_input` se enmascaran igual que el resto (ADR-0009).

## Uso de la suscripción (`statusline.mjs`)

Para enseñar en el board lo que queda de la cuota de tu suscripción de Claude (ventana de 5 horas y semanal), el Adaptador también puede ejecutarse como comando de `statusLine` (ADR-0012). Los hooks no traen ese dato: Claude Code solo lo pasa, como `rate_limits.five_hour` y `rate_limits.seven_day`, en el JSON de la `statusLine`.

```json
{
  "statusLine": { "type": "command", "command": "node <MANDARINA>/adapters/claude-code/statusline.mjs" }
}
```

- Envía `PUT /api/v1/subscription-usage` con las ventanas válidas (cada una es independiente y puede faltar) y el `session_id`. Solo lleva números: no hay nada que enmascarar. Sin `rate_limits` o con un JSON mal formado no envía nada.
- Es **best-effort** como el hook (ADR-0004): timeout de 1,5 s, nunca lanza y sale siempre con código 0.
- **Sin cadena no imprime nada**, así que la línea de estado queda vacía. Si ya tenías una `statusLine`, encadénala.

### Encadenar la `statusLine` que ya tenías

Claude Code solo admite una `statusLine`. Deja tu comando anterior en `MANDARINA_STATUSLINE_CHAIN` y registra `statusline.mjs` en su lugar: el Adaptador ejecuta tu comando con el mismo JSON por stdin y reenvía su stdout y stderr tal cual, mientras envía la lectura a Mandarina en paralelo.

```json
{
  "env": { "MANDARINA_STATUSLINE_CHAIN": "npx ccstatusline@latest" },
  "statusLine": { "type": "command", "command": "node <MANDARINA>/adapters/claude-code/statusline.mjs" }
}
```

Si tu comando falla, la salida queda vacía y la lectura se envía igual.

### Cuándo no hay datos

- Solo hay datos con una suscripción (Pro o Max) y **después de la primera respuesta de la API de la Sesión**. Con API key, Bedrock o Vertex Claude Code no envía `rate_limits`; si el Harness tiene `ANTHROPIC_API_KEY`, esa clave tiene prioridad sobre la suscripción.
- Claude Code retira una ventana del JSON cuando su reinicio expira; Mandarina conserva la última lectura hasta entonces y luego la marca como pendiente de nueva lectura.
- **Supuesto por verificar:** el esquema sale de la documentación de Claude Code. Los fixtures `test/fixtures/statusline-*.json` son simulados y deben sustituirse por un payload real.

## Configuración (variables de entorno)

| Variable | Por defecto | Uso |
|---|---|---|
| `MANDARINA_PROJECT` | nombre de la carpeta de `CLAUDE_PROJECT_DIR` o del `cwd` | Nombre del Proyecto en Mandarina |
| `MANDARINA_URL` | `http://127.0.0.1:4000` | Backend de Mandarina (cámbialo si usas otro `BACKEND_PORT`) |
| `MANDARINA_RULES` | `rules.json` junto a `send_event.mjs` | Fichero de configuración de las Reglas de bloqueo |
| `MANDARINA_MASK_PII` | todas | Datos personales que se tapan antes de enviar: `email`, `phone`, `iban`, `card`, `id` (separadas por comas), `all` o `none`. Los secretos siempre se tapan (AC-60, AC-61) |
| `MANDARINA_STATUSLINE_CHAIN` | — | Solo `statusline.mjs`: comando de `statusLine` previo que se ejecuta y cuya salida se reenvía |
| `MANDARINA_DEBUG` | — | Si tiene valor, los errores de envío y de configuración se escriben en stderr |

Antes de enviar, el hook sustituye los secretos y los datos personales del Evento por marcadores con su tipo (`[REDACTED_API_KEY]`, `[REDACTED_EMAIL]`…), de modo que no salen de tu máquina en claro (ADR-0009). El servidor lo repite al ingerir. Las Reglas de bloqueo se evalúan antes, sobre el texto original.

Se pueden fijar por proyecto con la clave `env` del mismo `settings.json`.

## Reglas de bloqueo

En cada `PreToolUse` el hook evalúa las reglas **en local, antes de cualquier llamada de red** (ADR-0004): protegen aunque Mandarina esté apagado. Si una coincide, escribe en stdout la decisión `permissionDecision: "deny"` de Claude Code con el motivo `Mandarina bloqueó esta acción (<regla>): <motivo>`, sale con código 0 y envía un Evento `tool.blocked` con `block = { rule, reason }` en lugar del `tool.pre` (ADR-0006). Claude Code no ejecuta la herramienta, así que no habrá `tool.post`.

| Regla | Bloquea | No bloquea |
|---|---|---|
| `dangerous-rm` | `rm` recursivo y forzado (`-rf`, `-fr`, `-r -f`, `-Rf`, `--recursive --force`; también tras `sudo`/`xargs`, en cadenas `&&` `;` `\|` o dentro de `bash -c`) sobre `/`, `/*`, `~`, `$HOME`, el propio Directorio (`.`) o cualquier ruta fuera del Directorio de la Sesión | `rm -rf node_modules`, `rm -rf ./dist`, rutas absolutas dentro del Directorio (también `/c/...` de Git Bash con `cwd` de Windows) |
| `sensitive-file` | `Read`/`Write`/`Edit`/`MultiEdit`/`NotebookEdit` sobre `.env*`, `*.pem`, `id_rsa*`; comandos Bash que nombran uno de esos ficheros (`cat .env`, `cp id_rsa /tmp`, `echo X >> .env`) | `.env.example`, `.env.sample`, `.env.template` (plantillas que se versionan), `id_rsa.pub`, `echo ".env" >> .gitignore` |
| `force-push-main` | `git push` con `--force`, `-f`, `--force-with-lease` o refspec `+` hacia `main`/`master` (`origin main`, `HEAD:main`, `+main`, `refs/heads/main`) | `git push --force origin feature/x`, `git push origin main` sin forzar |
| `secret-in-command` | comandos Bash con secretos en claro: `sk-ant-…`, `sk-…`, `ghp_…`, `github_pat_…`, `AKIA…`, `figd_…`, `xox?-…`, `Bearer <token>`, `API_KEY=valor` | `API_KEY=$API_KEY`, `API_KEY=***`, `Bearer $TOKEN`, `echo "tokens: 5"` |

Los patrones de `secret-in-command` son los de `backend/src/domain/mask-secrets.ts`, copiados porque el Adaptador no tiene dependencias: si cambian allí, hay que cambiarlos en `lib/rules.mjs`.

### `rules.json`

```json
{
  "rules": {
    "dangerous-rm": { "enabled": true },
    "force-push-main": { "enabled": true },
    "sensitive-file": { "enabled": true },
    "secret-in-command": { "enabled": true }
  },
  "projects": {
    "mi-proyecto": { "disabled": ["sensitive-file"] }
  }
}
```

- `"enabled": false` desactiva una regla para todos los Proyectos.
- `projects.<Proyecto>.disabled` la desactiva solo en ese Proyecto (el mismo nombre que resuelve `MANDARINA_PROJECT` o la carpeta).
- Una regla que no aparece en el fichero está activa. Si el fichero falta o no es JSON válido se aplican **todas** (ante la duda, proteger); con `MANDARINA_DEBUG` se avisa por stderr.
- Para una configuración propia fuera del repo, apunta `MANDARINA_RULES` a otro fichero.

### Limitaciones

El hook no es un intérprete de shell: trocea el comando y aplica heurísticas.

- `git push --force` sin rama explícita (`git push -f`, `git push -f origin`) no se bloquea: saber la rama actual exigiría ejecutar git en cada invocación.
- `rm -rf $VAR` con otra variable que no sea `HOME` no se expande y se trata como ruta relativa (permitida). Solo se comprueba `rm` con `-r` **y** `-f`.
- Sin conocer el home, `~` cuenta como fuera del Directorio. El hook usa el home del usuario que lo ejecuta.
- No se analizan `$(...)` dentro de comillas dobles, heredocs ni scripts que el comando ejecute (`./limpiar.sh`).
- `sensitive-file` puede dar falsos positivos con comandos que solo nombran el fichero (`git rm --cached .env`, `docker run --env-file .env`). Desactívala por Proyecto si molesta.
- Solo Claude Code: las reglas viven en este Adaptador. La edición desde la UI es de la Fase 2.

## Tests

```bash
npm test   # node --test, con fixtures de payloads en test/fixtures/
```
