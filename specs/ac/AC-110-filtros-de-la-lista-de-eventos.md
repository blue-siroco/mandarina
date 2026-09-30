# AC-110 — La lista de Eventos se filtra por Proyecto, Sesión y periodo, en la URL

**Capa:** frontend · **Rebanada:** 1 · **Roadmap:** §1.2 · **Depende de:** AC-100

En `/eventos`:
- Filtros de **Proyecto** (desplegable con los Proyectos vistos), **Sesión** (desplegable con los identificadores cortos de las Sesiones vistas) y **Periodo** (1 h · 24 h · 7 d · Todo; por defecto Todo), reflejados en la URL como `proyecto`, `sesion` y `periodo` (el valor por defecto no aparece), junto a `categoria`, `herramienta` e `internos` (AC-17).
- El historial se pide a `GET /api/v1/events` con `project`, `session_id` y `since` (`since` = ahora − periodo, recalculado al abrir la pantalla o cambiar el periodo); sin filtro no se envía nada de eso. Cambiar un filtro recarga el historial sin duplicar ni mezclar Eventos del filtro anterior.
- Una URL con filtros al abrirla los aplica; "Limpiar filtros" los quita todos.

**Verificación:** tests de caso de uso, infraestructura (HTTP simulado) y componente (Vitest); E2E en AC-115.
