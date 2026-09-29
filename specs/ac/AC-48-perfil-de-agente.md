# AC-48 — El perfil de un Tipo de Subagente muestra su uso, su coste y lo que hace

**Rebanada:** 10 · **Roadmap:** §1.10 · **Diseño:** spec/design.md §6.4f

En `/agentes/<tipo>`, con el periodo y el Proyecto de la URL:
- **cabecera**: el Tipo, sus Proyectos y quién lo lanza ("Agente principal" o el Tipo del lanzador, con cuántos Lanzamientos);
- **fichas**: Lanzamientos, en marcha, duración mediana / p95, Coste estimado total y por Lanzamiento, y primer / segundo plano;
- **gráfico**: Lanzamientos por día local, con barras verticales `@lucia/element-bars`, legible en tema claro y oscuro;
- **tablas** de herramientas (llamadas, con error, Bloqueos), skills (invocaciones), Servidores MCP (llamadas, con error) y Ejecuciones de tests (pasan / fallan);
- **Lanzamientos**: hora, Sesión, Tarea, estado con texto (Terminado / Sin respuesta / En marcha), plano, duración, herramientas con error, Bloqueos, modelo, coste y respuesta resumida. Cada uno enlaza a `/sesiones/<id>?pestana=subagentes&subagente=<id>`;
- un Tipo sin Lanzamientos en el periodo lo dice y ofrece volver a `/agentes`.

Se actualiza en vivo como la pantalla Agentes.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
