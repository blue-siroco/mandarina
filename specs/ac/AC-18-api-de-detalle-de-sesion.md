# AC-18 — La API devuelve el detalle de una Sesión

**Rebanada:** 3 · **Roadmap:** §1.3 · **Diseño:** spec/design.md §5.10, §6.3 · **ADR:** 0003

`GET /api/v1/sessions/{id}` devuelve el resumen de AC-15 y además:
- si hay Transcript: el Uso de tokens total (Sesión y Subagentes), el Coste estimado (`null` si algún modelo no tiene Tarifa), el número de peticiones al modelo, los modelos usados y la ventana de contexto estimada (usada / límite / modelo, con la entrada completa de la última respuesta del agente principal);
- el uso por herramienta, ordenado de más a menos;
- los Turnos, con inicio, fin (`null` si está en curso), duración, texto del prompt y número de herramientas;
- los Subagentes, con tipo, inicio, fin, duración, herramientas y, si su Transcript existe, modelo y tokens;
- los Bloqueos (AC-21).

Sin Transcript, `transcript_available` es `false` y los campos que dependen de él son `null`; el resto funciona igual. Si la Sesión no existe, responde 404.

**Verificación:** tests de integración (Vitest).
