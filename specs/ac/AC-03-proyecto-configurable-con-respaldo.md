# AC-03 — El Proyecto es configurable con respaldo al nombre de carpeta

**Rebanada:** 1 · **Glosario:** Proyecto

Dada la variable de entorno `MANDARINA_PROJECT`, el Evento lleva ese valor como `project`.
Sin ella, `project` es el nombre de la carpeta de `CLAUDE_PROJECT_DIR` y, si tampoco existe, el nombre de la carpeta del `cwd`.
La URL del servidor se toma de `MANDARINA_URL` (por defecto `http://127.0.0.1:4000`).

**Verificación:** tests del Adaptador.
