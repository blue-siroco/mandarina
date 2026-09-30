# Las Sesiones y los Eventos se descargan desde la UI, con estructura por defecto y contenido opt-in

Lo que Mandarina observa solo sale hoy por dos vías: la Exportación OTLP, que se activa con variables de entorno y solo envía los Turnos que terminan después de encenderla (ADR-0008, roadmap §1.11), y el Dataset de evaluación JSONL de las Evaluaciones (§1.12). No hay forma de llevarse a un fichero una Sesión o los Eventos que la persona está viendo, y el dashboard no ofrece ningún botón de exportar. Esta decisión añade esa vía (roadmap §1.18).

## Decisiones

- **Es una descarga, no una configuración.** El ADR-0008 sigue vigente: el exportador OTLP se configura por entorno y no desde la UI. Esta decisión no lo toca; añade un canal distinto, iniciado por la persona en cada ocasión, que produce un fichero local. No envía nada a ningún sitio.
- **Dos unidades exportables, donde ya está el contexto.** Una Sesión, desde su detalle; y los Eventos que pasan los filtros de la pantalla Eventos, desde esa pantalla. Exportar un Proyecto entero o toda la base de datos queda para §1A.9 (retención y gestión de los datos). Se descarta un botón global de «exportar todo»: sin filtro ni vista previa, es fácil llevarse mucho más de lo que se quería.
- **Dos formatos, los mínimos útiles.** La Sesión, en **JSON** (metadatos, Turnos, Subagentes, Eventos, tokens, caché y Coste estimado). Los Eventos, en **JSONL**, uno por línea, como ya hace el Dataset de evaluación. Se descartan por ahora CSV (los Eventos son anidados) y OTLP descargable (reutilizaría el generador de trazas del ADR-0008, pero duplicaría su semántica de Turno pendiente/exportado); pueden llegar después sin cambiar esto.
- **Estructura por defecto, contenido opt-in por descarga.** Por defecto el fichero lleva estructura, tiempos, Tipos de evento, nombres de herramienta, tokens, caché y coste. Los prompts, las respuestas y las entradas y salidas de herramientas solo van si la persona marca una casilla explícita en el diálogo de exportación, análoga a `MANDARINA_OTLP_INCLUDE_CONTENT` (ADR-0008). El diálogo dice qué contendrá el fichero antes de descargarlo.
- **El contenido sale siempre enmascarado.** Los Eventos guardados ya pasaron por el enmascarado (ADR-0009), y todo lo que se lee del Transcript para completar la Sesión se enmascara igual antes de incluirlo. Una descarga nunca es un camino para sacar un secreto o un dato personal en claro.
- **La descarga la sirve el backend.** Endpoints de solo lectura en el contrato (`specs/api-spec.yaml`, que se cambia primero) con `Content-Disposition: attachment`, y el JSONL en streaming para no cargar todos los Eventos en memoria. El frontend solo enlaza a ellos con los filtros y la casilla de contenido; no monta el fichero en el navegador. Se descarta armar el fichero en el cliente: duplicaría el acceso a los Transcripts y el enmascarado, que viven en el backend (ADR-0003, ADR-0009).
- **Nunca frena el flujo local.** Igual que la Exportación OTLP, la descarga es lectura y no bloquea la ingesta ni el hook (ADR-0004). Un tope de Eventos por descarga, con aviso de truncado explícito, evita que una petición enorme degrade el backend.
- **Sin efectos.** Descargar no cambia el estado de nada: ni marca Turnos como exportados ni escribe en SQLite. Es independiente de la Exportación OTLP.

## Detalles cerrados

- **Vista previa:** el diálogo enseña el recuento de Eventos y la lista de campos que llevará el fichero, sin línea de ejemplo. El recuento sale de endpoints `.../preview` que no leen los Eventos (AC-145, AC-147).
- **Tope:** 50 000 Eventos por descarga. Si se supera, se descargan los más recientes y se omiten los más antiguos; el fichero lo dice en su cabecera (`truncated`, `total`, `exported`, `omitted`) y el diálogo avisa antes de descargar (AC-145). No es configurable en el MVP: un ajuste esperaría a la pantalla de ajustes de §1A.9.
- **Cabecera en el fichero:** el JSONL abre con una línea `export` y el JSON de Sesión lleva un bloque `export`, con el mismo contenido (AC-142, AC-144). Los Eventos van en orden cronológico ascendente.
- **Numeración:** punto propio 1.18 del roadmap, no parte de §1A.9, porque es un botón de la UI que se puede cerrar en el MVP y §1A.9 es gestión de datos.
- **Criterios:** AC-142 a AC-149 en `specs/ac/`.

## Consequences

- El contrato de la API gana dos endpoints de lectura; el mock (`mock-server/lib/mock-api.mjs`) los implementa a la vez.
- Nuevo vocabulario en `CONTEXT.md`: **Descarga de Sesión** y **Descarga de Eventos**, distintas de la **Exportación OTLP**.
- Los ficheros descargados salen de la máquina en cuanto la persona los mueve: el aviso del diálogo y el enmascarado son las únicas garantías, no hay control posterior. El contenido opt-in exige la casilla marcada a propósito en cada descarga; no se recuerda la elección entre descargas.
- La exportación de un Proyecto, la importación del historial (§1A.8) y las descargas programadas siguen fuera de alcance.
