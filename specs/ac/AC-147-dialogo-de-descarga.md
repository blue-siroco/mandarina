# AC-147 — El diálogo de descarga dice qué contendrá el fichero antes de descargar

**Capa:** frontend (presentación + caso de uso) · **Rebanada:** 19 · **Roadmap:** §1.18 · **ADR:** 0013 · **Datos:** AC-145 (`.../preview`)

- Modal accesible (`role="dialog"`, `aria-modal`, foco atrapado, se cierra con Escape y devuelve el foco al botón que lo abrió), con el patrón del modal del exportador OTLP.
- Enseña, al abrirse y al cambiar la casilla: cuántos Eventos incluirá (`exported` de la vista previa), la **lista de campos** que llevará el fichero y el formato (JSON de Sesión o JSONL de Eventos). No enseña ninguna línea de ejemplo.
- Casilla **Incluir contenido**, desmarcada cada vez que se abre el diálogo (no se recuerda entre descargas ni se guarda en el navegador). Al marcarla, la lista de campos suma prompts, respuestas y entradas y salidas de herramientas, y el diálogo repite que salen enmascarados.
- Si `truncated`, un aviso visible: «Se incluirán los N Eventos más recientes; M quedan fuera. Acota con los filtros.»
- Aviso siempre visible: el fichero sale de Mandarina y ya no tiene control posterior.
- «Descargar» enlaza al endpoint con los filtros y `content` vigentes y solo se activa cuando la vista previa ha cargado; con `total` 0 está desactivado y el diálogo lo dice. Un fallo de la vista previa se muestra con texto y permite reintentar.
- El texto de la interfaz usa «Descargar», «Descarga de Sesión» y «Descarga de Eventos» (CONTEXT.md), no «Exportación».

**Verificación:** `export-dialog.spec.ts`.
