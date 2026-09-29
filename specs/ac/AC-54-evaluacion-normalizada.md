# AC-54 — Una Evaluación tiene Puntuación, Etiquetas y Nota, normalizadas

**Rebanada:** 12 · **Roadmap:** §1.12

Una Evaluación es el juicio de la persona usuaria sobre un objeto: una **Sesión** (`session_id`), un **Turno** (id del `prompt.submitted` que lo abre) o un **Subagente** (`subagent_id`). Hay como mucho una por objeto. Sus tres partes son opcionales, pero no puede estar vacía.

- **Puntuación**: `1` (bien), `-1` (mal) o `null`. Cualquier otro valor es inválido.
- **Etiquetas**: se guardan en minúsculas, con los espacios y guiones bajos convertidos en guiones (`Bug fix` → `bug-fix`), sin más caracteres que letras, números y guiones, sin guiones repetidos ni en los extremos y sin repetir. Como máximo 10, de hasta 40 caracteres; una vacía tras normalizar se descarta.
- **Nota**: texto de hasta 2000 caracteres. Una nota en blanco se guarda como `null`.
- Se enmascaran los secretos de la Nota y de las Etiquetas como los de cualquier Evento.
- Una Evaluación sin Puntuación, sin Etiquetas y sin Nota es vacía y no se guarda.

Al guardar se anotan el Proyecto y la Sesión del objeto, para poder filtrar sin volver a buscarlos. `created_at` no cambia al editar; `updated_at` sí. Las Evaluaciones viven en su propia tabla de SQLite, no son Eventos y no se difunden por WebSocket.

**Verificación:** tests unitarios del dominio (Vitest) y de integración del almacén contra SQLite en memoria.
