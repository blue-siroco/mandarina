# Las Ejecuciones de tests se derivan de los Eventos `Bash` en el servidor

El visor del Estado de los tests (rebanada 5) necesita saber qué tests lanzaron los agentes y con qué resultado. Decidimos derivar cada Ejecución de tests **al consultar**, en el backend, de los Eventos `tool.post` de la herramienta `Bash`: si el comando lanza tests y la salida trae el resumen de un runner reconocido (Vitest, Jest, `node:test`, Playwright), se lee de ahí. Se descartan tres alternativas:

- **Un Tipo de evento `test.finished` enviado por el Adaptador**: metería en el hook conocimiento de los runners, que cambia más a menudo que Claude Code, y obligaría a actualizar el Adaptador de cada Harness. Leerlo en el servidor sirve para todos los Harness y aplica a los Eventos ya guardados.
- **Leer los reportes de los runners (JSON, JUnit XML) del disco del Proyecto**: el backend corre en Docker y solo ve `~/.claude` (ADR-0003), no los Directorios. Queda para después del MVP.
- **Guardar las Ejecuciones en una tabla al ingerir**: un segundo almacén que mantener al día. Mejorar un lector de resultados no arreglaría los datos ya guardados.

Para ver los tests en rojo, el Adaptador captura también `PostToolUseFailure`. Claude Code lo lanza en lugar de `PostToolUse` cuando la herramienta falla, por ejemplo un comando que sale con un código distinto de 0. Se normaliza como `tool.post`: la invocación terminó, aunque fuera mal. El nombre nativo se conserva en `native_event_type` y el error en `payload.error` (ADR-0002).

## Consequences

- Solo se ven las Ejecuciones que lanzó un agente con `Bash`. Los tests lanzados a mano en otro terminal o por CI no aparecen.
- Una salida sin resumen reconocible (runner desconocido, error antes de ejecutar ningún test, salida recortada) no genera Ejecución. Es preferible a inventar un resultado.
- Leer resultados es una heurística sobre texto: los tests de dominio fijan con fixtures el formato de cada runner. Un cambio de formato en un runner rompe esos tests, no la ingesta.
- `schema_version` sigue en 1: `PostToolUseFailure` reutiliza un Tipo de evento existente.
- Un `tool.post` con `payload.error` cuenta como herramienta con error en la actividad de los Subagentes (AC-23).
