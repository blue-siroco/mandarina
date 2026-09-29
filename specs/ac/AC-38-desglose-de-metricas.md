# AC-38 — La API de métricas filtra por Directorio y desglosa por Directorio y por modelo

**Rebanada:** 8 · **Roadmap:** §1.8 · **ADR:** 0005

`GET /api/v1/metrics?since=…`:
- con `directory`, todas las cifras (Sesiones, Subagentes en marcha, actividad, tokens, Coste estimado, Transcripts) son solo de las Sesiones de ese Directorio;
- sin `breakdown=true`, `breakdown` es `null`. Con él, trae `by_directory` y `by_model`, y cada fila lleva las mismas cifras que el total: Sesiones trabajando, en pausa y Huérfanas, Subagentes en marcha, herramientas, prompts, Bloqueos, tokens, Coste estimado y modelos sin Tarifa;
- **por Directorio**: una fila por Directorio con actividad en el periodo, con su Proyecto, su modelo principal (el de más tokens de salida) y sus Transcripts no disponibles;
- **por modelo**: tokens y coste exactos, respuesta a respuesta, incluidos los Subagentes. Una Sesión cuenta en el modelo de su última respuesta; un Subagente en marcha, en el de la suya; una herramienta, un prompt o un Bloqueo, en el de la respuesta anterior de su Sesión o Subagente (o la siguiente si aún no había ninguna). Lo que no tiene modelo conocido va a la fila `model: null`. Cada fila lleva la Tarifa aplicada y el coste por clase de token (`null` sin Tarifa);
- las filas de cada desglose suman el total.

Un `directory` vacío o un `breakdown` que no es booleano responden 400.

**Verificación:** tests de dominio e integración (Vitest).
