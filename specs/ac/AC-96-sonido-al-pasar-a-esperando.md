# AC-96 — Suena un aviso corto al pasar una Sesión a Esperando, sin bucle y silenciable

**Capa:** frontend · **Rebanada:** 16 · **Roadmap:** §1.16 · **Reutiliza:** AC-83 (`AlertSound`)

- Al detectar que una Sesión pasa a Esperando (no estaba Esperando en el snapshot anterior y lo está en el nuevo, o llega el Evento que la deja Esperando), suena un sonido corto generado con Web Audio, **distinto** del de *Cerca* y *Superado* de los Presupuestos (otra frecuencia o patrón; se reutilizan el `AudioContext` de fábrica, el armado por interacción y el interruptor, no se duplican).
- Solo suena si la persona usuaria ya interactuó con la página (`pointerdown`/`keydown`); si no, se omite en silencio. No suena al cargar la página ni por Sesiones que ya estaban Esperando en la primera carga.
- Un solo sonido por transición. Si varias Sesiones pasan a Esperando en el mismo refresco, suena una vez.
- Sin bucle: una Sesión que sigue Esperando vuelve a sonar como mucho una vez cada 5 minutos, y solo si sigue Esperando. Si deja de esperar y vuelve a esperar antes de ese plazo, la nueva transición no suena hasta cumplirse el plazo. La duración mínima entre sonidos es una constante única.
- Un interruptor **Silenciar avisos** en el aviso de la cabecera silencia también este sonido. Se guarda en el navegador (`localStorage`, no en la URL ni en el servidor), por defecto activo. Es el mismo interruptor que el de Presupuestos (AC-83), y la etiqueta deja claro que silencia todos los avisos sonoros.
- Sin Web Audio o sin `localStorage` el aviso visual funciona igual y no se produce ningún error.

**Verificación:** tests unitarios (Vitest) con `AUDIO_CONTEXT_FACTORY` y reloj doblados: transición, primera carga, plazo de 5 min, silencio, sin interacción, tono distinto del de AC-83.
