# AC-97 — Los Eventos de espera se leen bien en la lista de Eventos y en la Línea de tiempo

**Capa:** frontend · **Rebanada:** 16 · **Roadmap:** §1.16

- La pantalla de Eventos, el filtro por Tipo y la Línea de tiempo del detalle tienen etiqueta en español para los dos Tipos de evento nuevos (p. ej. "Pide permiso" y "Notificación"), sin mostrar el identificador crudo ni romper por un Tipo desconocido.
- El Evento de permiso muestra la herramienta y el resumen de su entrada; el de notificación, su mensaje. Ambos expandibles como el resto (AC-17), con el payload enmascarado.
- Estos Eventos no cuentan como herramientas ni como Turnos en la Línea de tiempo (AC-87).

**Verificación:** tests de componente (Vitest) con Eventos de fixtures.
