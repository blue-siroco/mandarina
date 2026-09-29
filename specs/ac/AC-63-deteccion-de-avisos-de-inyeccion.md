# AC-63 — Se detecta contenido que parece dar órdenes al agente

**Rebanada:** 13 · **Roadmap:** §1.13

Se busca en el texto que devuelve una herramienta que lee contenido externo, no en los prompts de la persona usuaria ni en las respuestas del modelo:
- `WebFetch`, `WebSearch` y `Read`;
- cualquier Herramienta MCP;
- `Bash` cuando el comando contiene `curl` o `wget`.

La búsqueda se hace en el `tool_response` de sus `tool.post` (no en los `PostToolUseFailure`), al consultar, sin Tipo de evento nuevo ni cambios en el Adaptador (ADR-0007). Cada patrón que salta da un **Aviso de inyección** con `pattern`, `category`, `severity` y `snippet`:

| Categoría | Patrón (`pattern`) | Severidad |
|---|---|---|
| `override` | `ignore-previous`: "ignore / disregard / forget … previous / above … instructions", "ignora / olvida las instrucciones anteriores" | media |
| `override` | `role-reassignment`: "you are now …", "new system prompt" | media |
| `impersonation` | `fake-system-tag`: `<system>`, `</user>`, `<assistant>`, `<\|im_start\|>`, `[SYSTEM]`, `[INST]` | alta |
| `impersonation` | `fake-turn`: una línea que empieza por `Human:`, `Assistant:` o `System:` | alta |
| `hidden` | `tag-characters`: caracteres Unicode de etiqueta (U+E0000–U+E007F) | alta |
| `hidden` | `bidi-controls`: controles bidireccionales (U+202A–U+202E, U+2066–U+2069) | media |
| `hidden` | `zero-width-run`: 3 o más caracteres de ancho cero seguidos | baja |
| `hidden` | `html-comment-instruction`: un comentario HTML con "ignore", "assistant", "instruction", "system"… | baja |
| `hidden` | `hidden-element`: un elemento `display:none` cuyo texto da instrucciones | baja |
| `exfiltration` | `exfiltrate-request`: pedir enviar secretos, credenciales, claves o la conversación a una URL | alta |
| `exfiltration` | `pipe-to-shell`: pedirle al agente que ejecute `curl … \| sh` ("you must run curl … \| sh"); un `curl … \| sh` a secas, como el de un README de instalación, no salta | alta |
| `exfiltration` | `read-secrets-and-send`: leer `.env`, `id_rsa` o credenciales y enviarlo | alta |
| `exfiltration` | `markdown-image-exfil`: una imagen Markdown hacia una URL externa con datos en la query | alta |

- Cada patrón da como mucho un aviso por Evento, con el fragmento alrededor de la primera coincidencia (hasta 200 caracteres, en una línea y enmascarado).
- La fuente (`source`) es la URL de `WebFetch`, la búsqueda de `WebSearch`, la ruta de `Read`, `servidor · herramienta` de una Herramienta MCP o el comando de `Bash`, en una línea.
- Los patrones se fijan con fixtures en los tests de dominio. Un texto normal (un README que documenta la técnica sin usarla, código fuente) no debe saltar con los patrones de severidad alta.

**Verificación:** tests unitarios del dominio (Vitest).
