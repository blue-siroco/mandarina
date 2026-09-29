# AC-20 — El hook aplica las Reglas de bloqueo en local

**Rebanada:** 4 · **Roadmap:** §1.4 · **ADR:** 0004, 0006

Dado un hook `PreToolUse`, el Adaptador evalúa las Reglas de bloqueo antes de cualquier llamada de red:
- `dangerous-rm`: `rm` recursivo y forzado (en cualquier grafía, también tras `sudo`, en cadenas `&&`/`;`/`|` o dentro de `bash -c`) sobre `/`, `~`, `$HOME`, el propio Directorio o una ruta fuera del Directorio de la Sesión (`cwd`);
- `sensitive-file`: `Read`/`Write`/`Edit`/`MultiEdit`/`NotebookEdit` o un comando Bash sobre `.env*`, `*.pem` o `id_rsa*`, salvo las plantillas `.env.example`, `.env.sample`, `.env.template` y la clave pública `id_rsa*.pub`;
- `force-push-main`: `git push` con `--force`, `-f`, `--force-with-lease` o refspec `+` hacia `main`/`master` nombrada explícitamente;
- `secret-in-command`: comando Bash con un secreto en claro (los mismos patrones que el enmascarado del servidor, AC-06), sin contar referencias `$VAR` ni valores ya enmascarados `***`.

Si una regla coincide, el hook escribe en stdout una sola línea con `permissionDecision: "deny"` y el motivo `Mandarina bloqueó esta acción (<regla>): <motivo>`, y envía un Evento `tool.blocked` con `block = { rule, reason }` en lugar de `tool.pre`. La denegación no depende del servidor: con Mandarina apagado o colgado el hook deniega igual y sale con código 0 en menos de 3 s. Los demás Eventos no llevan `block` ni escriben en stdout.

Las reglas se configuran en `adapters/claude-code/rules.json` (o el fichero de `MANDARINA_RULES`), con desactivación global y por Proyecto. Si el fichero falta o está mal formado se aplican todas.

**Verificación:** tests del Adaptador (`node:test`): casos positivos y negativos de cada regla, overrides, configuración inválida y el hook de extremo a extremo contra un servidor de prueba, apagado y colgado.
