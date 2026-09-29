# AC-59 — La Puntuación se ve en el board y en la comparativa de agentes

**Rebanada:** 12 · **Roadmap:** §1.12

- `GET /api/v1/sessions` y `GET /api/v1/sessions/{id}` devuelven `evaluation_score` (`1`, `-1` o `null`): la Puntuación de la Evaluación de la Sesión. La tarjeta del board la muestra con un icono y texto accesible ("Sesión bien puntuada" o "Sesión mal puntuada"); sin Puntuación no muestra nada.
- `GET /api/v1/agents` y `GET /api/v1/agents/{type}` añaden a cada fila `rated_up` y `rated_down`: cuántos Lanzamientos del Tipo tienen un Subagente con Evaluación de +1 y de −1.
- La pantalla `/agentes` gana una columna **Bien** con el % de +1 sobre los puntuados (`—` si ninguno), ordenable como las demás. El perfil del Tipo muestra "N bien · M mal".

**Verificación:** tests de integración del backend (Vitest), tests de componente (Vitest) y E2E Playwright.
