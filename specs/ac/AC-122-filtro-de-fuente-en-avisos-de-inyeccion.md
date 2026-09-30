# AC-122 — Los Avisos de inyección se filtran por fuente

**Capa:** frontend · **Roadmap:** §1.13 · **Amplía:** AC-66

- La pestaña *Avisos de inyección* añade un filtro **Fuente** con las opciones *Web (URL)*, *Fichero*, *Servidor MCP* y *Otra herramienta* (el resto, p. ej. `Bash` con `curl`), más «Todas las fuentes».
- La fuente de un aviso se deduce de su herramienta (`WebFetch`/`WebSearch` = Web, `Read` = Fichero, `mcp__…` = Servidor MCP), no del texto libre de `source`.
- El filtro se refleja en la URL como `?fuente=url|fichero|mcp|herramienta` como los demás, se restaura al cargar la URL y se combina con ellos; quitarlo elimina el parámetro.
- Se aplica en el cliente sobre la lista ya recibida: no cambia la petición a la API.

**Verificación:** tests unitarios (Vitest) de la pestaña; E2E de `/seguridad` con red interceptada.
