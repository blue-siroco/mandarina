# AC-112 — El board agrupa Proyecto → Sesión → Directorio

**Capa:** frontend · **Rebanada:** 2 · **Roadmap:** §1.2 · **Depende de:** AC-16

Dentro de cada Proyecto del board, las Sesiones se agrupan por Directorio:
- Cada Directorio es un subencabezado con su ruta truncada por la izquierda (`…/Codev/mandarina`) y la ruta completa en el tooltip; los Directorios van en orden alfabético y, dentro, las Sesiones por inicio (la más nueva primero), sin que nada se mueva al llegar Eventos.
- Las Sesiones Cerradas de un Proyecto siguen ocultas tras "Mostrar N cerradas", agrupadas también por Directorio.
- El filtro de Directorio (`?directorio=`) y el comportamiento en vivo se mantienen; un Proyecto con un solo Directorio muestra igualmente su subencabezado.

**Verificación:** tests de caso de uso y componente (Vitest); E2E en `sessions.spec.ts`.
