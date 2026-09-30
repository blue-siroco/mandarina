# AC-94 — Las Sesiones Esperando se distinguen en la tarjeta del board y en el detalle

**Capa:** frontend · **Rebanada:** 16 · **Roadmap:** §1.16

- La tarjeta de una Sesión con `activity = waiting` muestra un badge destacado **Esperando** (distinto de *Trabajando* y *En pausa*; el estado se distingue con texto, no solo con color) y el motivo en una línea: "Pide permiso para `Bash`: `npm run build`", "Pregunta: …" o "Inactiva esperando tu respuesta". Si espera un Subagente, lo dice ("Subagente `e2e-builder` pide permiso…").
- El detalle de Sesión muestra el mismo badge y el motivo completo en la cabecera, con el tiempo que lleva esperando.
- Cuando la Sesión deja de esperar (siguiente refresco tras `event.ingested`), el badge desaparece y vuelve el de Trabajando o En pausa.
- Los textos del motivo se pintan como texto (nunca como HTML) y llegan enmascarados.
- Tarjetas y detalle son accesibles: el badge tiene texto legible por lector de pantalla.

**Verificación:** tests de componente (Vitest) de tarjeta y detalle con fixtures; E2E en AC-98.
