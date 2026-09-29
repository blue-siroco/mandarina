# AC-53 — La barra lateral avisa de que se está exportando

**Rebanada:** 11 · **Roadmap:** §1.11

Con el exportador activo, la barra lateral muestra "Exportando a `<host>`" y, si se exporta el contenido, "incluye contenido". Si hay Turnos `failed`, el indicador lo dice con su número y con texto, no solo con color. Con el exportador desactivado no aparece nada.

Al pulsar el indicador se abre un modal (patrón `angular-modal`):
- recuento de Turnos pendientes, exportados y fallidos, y hora de la última exportación;
- tabla de los últimos Turnos con Proyecto, estado, intentos y último error, cada uno con enlace a su Sesión (`/sesiones/<id>`).

El modal se cierra con `Esc`, con el botón de cerrar y pulsando fuera, y devuelve el foco al indicador. El estado se refresca cada 30 s. Un fallo al consultarlo no rompe la barra lateral: el indicador simplemente no aparece.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
