# AC-31 — El detalle de Sesión muestra sus Invocaciones de skill

**Rebanada:** 6 · **Roadmap:** §1.6 · **Diseño:** spec/design.md §6.3

- Un Evento de la herramienta `Skill` se resume en una línea como `Skill · <nombre>` en la lista de Eventos, en la herramienta en curso de la tarjeta del board y en las herramientas de los Subagentes.
- En `/sesiones/:id`, la pestaña *Skills* (`?pestana=skills`), con su contador, lista las Invocaciones de skill de la Sesión: hora, skill, argumentos, quién la invocó (agente, persona usuaria o el tipo del Subagente), estado con texto y no solo color (En curso, Terminada, Fallida, con el error) y duración.
- Cada invocación enlaza a su Turno: `?pestana=linea&turno=N` abre la *Línea de tiempo* con ese Turno resaltado.
- Sin invocaciones, la pestaña explica de dónde salen (herramienta `Skill` y prompts `/nombre`). Se refresca en vivo como el resto del detalle.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
