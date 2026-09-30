# El uso de la suscripción llega por el `statusLine` y se guarda como dato de la cuenta

Quien trabaja con una suscripción de Claude (Pro o Max) no paga por token: le limita la cuota de la ventana de 5 horas y la semanal (roadmap §1.17). Ese dato solo sale por un canal: el JSON que Claude Code pasa por stdin al comando de `statusLine`, con `rate_limits.five_hour` y `rate_limits.seven_day`, cada uno con `used_percentage` y `resets_at` (epoch en segundos). Solo aparece después de la primera respuesta de la API de la Sesión, Claude Code lo retira cuando `resets_at` expira y cada ventana puede faltar por separado. No viaja en los hooks que captura el Adaptador (ADR-0002) ni está en los Transcripts (ADR-0003).

## Decisiones

- **Endpoint dedicado y tabla singleton, no un Evento.** La lectura no es un hecho de una Sesión sino de la cuenta: todas las Sesiones de la persona comparten las dos ventanas. Como las Evaluaciones (§1.12), vive fuera del flujo de Eventos: `PUT /api/v1/subscription-usage` sustituye una fila única en SQLite (la última lectura recibida de cualquier Sesión) y `GET` la devuelve. `event_type` y `schema_version` no cambian. Se descarta un Tipo de evento propio: contaría en `event_count`, en la actividad reciente y en las exportaciones sin ser de ninguna Sesión.
- **Una ventana ausente en la lectura nueva conserva la anterior solo si su `resets_at` sigue en el futuro.** Claude Code puede omitir una ventana en una respuesta y enviarla en la siguiente; borrarla enseñaría un hueco falso. Una ventana caducada se descarta, porque ya no describe la cuota vigente.
- **El estado se calcula al consultar, con el reloj del servidor.** `reset_pending` si `resets_at` ya pasó (la lectura es vieja y no se muestra su porcentaje como vigente), `exhausted` si no queda nada, `near` si queda el 20 % o menos y `comfortable` en otro caso. Se envía también `remaining_percent` (`100 − usado`), que es lo que la ficha enseña.
- **La suscripción se deduce de que existan datos.** No hay campo con el tipo de autenticación. Sin ninguna lectura, `usage` es `null` y el board no enseña ficha. Con API key, Bedrock o Vertex Claude Code no envía `rate_limits`; si el Harness tiene `ANTHROPIC_API_KEY`, esa clave tiene prioridad y tampoco habrá datos.
- **El Adaptador también se ejecuta como comando de `statusLine`** (`statusline.mjs`). Una persona solo tiene una `statusLine`, así que el Adaptador se encadena con la que ya tuviera: `MANDARINA_STATUSLINE_CHAIN` guarda el comando previo, se ejecuta con el mismo stdin y su salida se reenvía tal cual. Sin cadena, no imprime nada.
- **Fail-open y sin ralentizar (ADR-0004).** La `statusLine` se ejecuta con frecuencia y su salida se pinta en el terminal. El envío es best-effort: timeout corto (1,5 s), no espera reintentos, nunca lanza ni cambia el código de salida, y se lanza a la vez que la cadena, de modo que la salida no espera al servidor más que el tope. Un JSON mal formado, o sin `rate_limits` válido, no envía nada.
- **No se enmascara.** El envío solo lleva números y el `session_id` (ADR-0009 no aplica).
- **Difusión por el WebSocket** con un mensaje propio, `subscription.usage`, con la lectura ya calculada (o `null`), igual que `budget.state`. El cliente lo aplica sin volver a consultar.

## Supuesto por verificar

El esquema de `rate_limits` sale de la documentación de Claude Code, no de un payload real capturado en este repositorio (como A-01 en §1.16). Los fixtures de `adapters/claude-code/test/fixtures/statusline-*.json` son simulados y lo declaran. Hay que sustituirlos por una lectura real antes de dar AC-127 por cerrado.

## Consequences

- El registro del `statusLine` en `.claude/settings.json` es una segunda configuración manual del Adaptador; el README explica cómo encadenar la que ya exista.
- Con Mandarina caído el `statusLine` sigue funcionando y la cadena se ejecuta igual; solo se pierde esa lectura.
- El dato es la última lectura de la cuenta, sin histórico. La previsión de consumo y los avisos al acercarse al límite quedan para 2.7, 1A.1 y 7.3.
- Los Presupuestos (1.15) siguen en USD; el Coste estimado (ADR-0005) no cambia con la suscripción.
