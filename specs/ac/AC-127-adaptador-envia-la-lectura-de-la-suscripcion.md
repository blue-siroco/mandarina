# AC-127 — El Adaptador envía la lectura de la suscripción desde el `statusLine`

**Capa:** adaptador · **Rebanada:** 17 · **Roadmap:** §1.17 · **ADR:** 0012

`adapters/claude-code/statusline.mjs` lee por stdin el JSON que Claude Code pasa al comando de `statusLine`.
- Si trae `rate_limits.five_hour` y/o `rate_limits.seven_day` con `used_percentage` (número) y `resets_at` (epoch en segundos), envía `PUT /api/v1/subscription-usage` con `{ session_id, five_hour?, seven_day? }` a `MANDARINA_URL`, con timeout de 1,5 s.
- Cada ventana es independiente: solo se envía la que es válida; una ventana con campos ausentes o de otro tipo se descarta sin invalidar la otra.
- Sin `rate_limits`, sin ninguna ventana válida o con un JSON mal formado (o vacío) no envía nada.
- `session_id` viaja solo si el JSON lo trae como texto no vacío.
- Nunca lanza ni cambia el código de salida (siempre 0): con Mandarina caído o lento sale igual. Acepta stdin con BOM.
- **Supuesto A:** los fixtures `statusline-*.json` son simulados a partir de la documentación de Claude Code; hay que sustituirlos por un payload real (ADR-0012).

**Verificación:** `node:test` en `adapters/claude-code/test/statusline.test.mjs` con un servidor HTTP local.
