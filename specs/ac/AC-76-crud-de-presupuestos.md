# AC-76 — Se pueden crear, editar, desactivar y borrar Presupuestos

**Rebanada:** 15 · **Roadmap:** §1.15 · **ADR:** 0010

Un **Presupuesto** es un límite de Coste estimado (USD, incluidos los Subagentes) para un ámbito:
- `session`: cada Sesión por separado, de todos los Proyectos (`project: null`) o de uno;
- `project_day`: un Proyecto (obligatorio) en el día natural;
- `global_day`: todos los Proyectos en el día natural (`project: null`).

Cada uno tiene un límite (`limit_usd`, mayor que 0), un umbral de aviso (`warn_ratio`, mayor que 0 y hasta 1, por defecto 0,8), una acción al superarse (`warn` o `stop`, por defecto `stop`) y si está activo (`enabled`, por defecto sí).

- `POST /api/v1/budgets` crea uno (`201`); `PUT /api/v1/budgets/{id}` lo sustituye; `DELETE` lo borra con sus excepciones (`204`); `GET /api/v1/budgets` los lista por orden de creación.
- Responde `400` si el ámbito es desconocido, si falta el Proyecto en `project_day` o sobra en `global_day`, si el límite no es un número mayor que 0, si el umbral queda fuera de (0, 1], o si la acción es desconocida. Responde `404` si el `id` no existe.
- Un Proyecto se compara por su nombre exacto y no hace falta que ya tenga Sesiones.
- Los Presupuestos viven en SQLite, no son Eventos y sobreviven a los reinicios. Editar el ámbito o el Proyecto de uno borra sus excepciones, porque dejarían de aplicarle.

**Verificación:** tests unitarios del dominio y de integración contra SQLite en memoria (Vitest).
