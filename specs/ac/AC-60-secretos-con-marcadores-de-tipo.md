# AC-60 — Los secretos se enmascaran con un marcador que dice qué eran

**Rebanada:** 13 · **Roadmap:** §1.13 · **ADR:** 0009 · **Sustituye a:** AC-06

Un secreto reconocido en cualquier texto de un Evento (o de lo que el servidor lee del Transcript) se sustituye por un marcador con su tipo, y el valor original no vuelve a aparecer en SQLite, en el WebSocket, en la API ni en lo que se exporta.

| Marcador | Qué sustituye |
|---|---|
| `[REDACTED_API_KEY]` | claves de API: `sk-…`, `sk-ant-…`, `ghp_…` y las demás de GitHub, `github_pat_…`, `AKIA…`, `figd_…`, `xox…-`, `AIza…` (Google), `sk_live_…` / `rk_live_…` (Stripe), `npm_…` y la ruta secreta de un webhook de Slack (`https://hooks.slack.com/services/T…/B…/…`); también las propiedades JSON `api_key`, `apiKey`, `access_key`… |
| `[REDACTED_TOKEN]` | cabeceras `Bearer …`, JWT (`eyJ….eyJ….…`) y las propiedades JSON `token` y `authorization` |
| `[REDACTED_PRIVATE_KEY]` | un bloque PEM de clave privada, de `-----BEGIN … PRIVATE KEY-----` a su `END` |
| `[REDACTED_PASSWORD]` | el valor de una asignación `CLAVE=valor` cuyo nombre en mayúsculas contiene `KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `PASSWD` o `CREDENTIAL`; la clave de una URL de conexión (`postgres://usuario:clave@host`); y las demás propiedades JSON (`secret`, `password`, `passwd`, `credentials`) |

- Una asignación o propiedad cuyo valor ya es un marcador se deja como está: enmascarar dos veces da el mismo resultado.
- La URL de conexión conserva el usuario y el host: solo se sustituye la clave.
- Un bloque de clave privada sin su línea `END` (salida recortada) se sustituye hasta el final del texto.
- Lo ya guardado con `***` no se migra; la UI trata igual ambas formas.

**Verificación:** tests unitarios del enmascarado (Vitest en el backend, `node:test` en el Adaptador) contra las mismas fixtures, y test de integración de la ingesta.
