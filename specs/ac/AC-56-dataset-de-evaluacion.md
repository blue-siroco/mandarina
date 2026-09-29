# AC-56 — El Dataset de evaluación se exporta en JSONL

**Rebanada:** 12 · **Roadmap:** §1.12

`GET /api/v1/evaluations/export` devuelve `application/x-ndjson` con una línea JSON por Evaluación que pasa los mismos filtros que `GET /api/v1/evaluations`, sin el límite de 500, la más reciente primero. Cada línea lleva:

- `object_type`, `object_id`, `project`, `session_id`;
- `prompt`: el del Turno, la Tarea del Subagente (su prompt) o, en una Sesión, todos los de la Sesión separados por una línea en blanco;
- `response`: la respuesta final del agente, la que trae el hook `Stop` (Turno y Sesión: la del último Turno terminado) o `SubagentStop` (Subagente); `null` si el objeto no ha terminado;
- `model`: el de la última respuesta del objeto en el Transcript (la del Turno, la del Subagente o la última de la Sesión); `null` sin Transcript;
- `tools`: nombres de las herramientas que invocó el propio agente en el objeto, sin repetir y por orden de primer uso (las de un Subagente van en su Evaluación, no en la de su Sesión ni su Turno);
- `score`, `tags`, `note` y `evaluated_at` (`updated_at`).

El contenido sale enmascarado como en la ingesta (ADR-0009). Sin Evaluaciones que cumplan el filtro, la respuesta es un cuerpo vacío. Un filtro inválido responde `400`.

**Verificación:** tests de integración (Vitest).
