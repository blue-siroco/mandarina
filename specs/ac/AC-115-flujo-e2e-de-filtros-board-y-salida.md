# AC-115 — Flujo E2E: filtros de Eventos, board por Directorio y salida de herramienta

**Capa:** e2e · **Roadmap:** §1.2, §1.3, §1.16

Playwright con red y WebSocket interceptados:
- `/eventos?proyecto=…&sesion=…&periodo=24h` pide `GET /api/v1/events` con `project`, `session_id` y `since`; cambiar el desplegable de Proyecto actualiza la URL y repite la petición; un Evento en vivo de otro Proyecto no aparece.
- El board muestra un subencabezado por Directorio dentro de cada Proyecto.
- Un `tool.post` de `Bash` muestra la primera línea de su salida en la fila.
- Un aviso de Subagente esperando enlaza a su fila en la pestaña Subagentes.

**Verificación:** `frontend/e2e` (Playwright).
