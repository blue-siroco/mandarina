# AC-73 — La caché de cada Lanzamiento y de cada Tipo de Subagente

**Rebanada:** 14 · **Roadmap:** §1.14

- Cada Lanzamiento de `GET /api/v1/agents/{type}` lleva `cache_hit_rate` y `cache_savings_net_usd`, calculados con las respuestas de su Subagente (AC-69); `null` sin Transcript.
- Cada fila de `GET /api/v1/agents` y el `summary` del perfil llevan `cache_hit_rate` (con los tokens de todos sus Lanzamientos, no la media de sus tasas) y `cache_savings_net_usd` (la suma de los de sus Lanzamientos con Transcript). Sin tokens, la tasa es `null` y el ahorro `0`.
- Un Subagente arranca con el contexto vacío, así que su tasa suele ser menor que la de la Sesión: la pantalla la muestra para comparar entre Tipos, no contra la Sesión.

**Verificación:** tests de integración (Vitest).
