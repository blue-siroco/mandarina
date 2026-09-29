# AC-82 — La pantalla Presupuestos permite configurarlos

**Rebanada:** 15 · **Roadmap:** §1.15 · **Diseño:** spec/design.md

En `/presupuestos`, en un grupo nuevo **Configurar** de la barra lateral (después de *Observar*):

- una tabla con un Presupuesto por fila: ámbito (Por Sesión, Proyecto y día, Global del día) y Proyecto, límite, lo gastado con su porcentaje y una barra de progreso, el estado con texto (Dentro, Cerca, Superado), la acción (Avisar, Detener), el interruptor de activo y las excepciones vigentes;
- un formulario para **crear** y **editar** con ámbito, Proyecto (solo cuando aplica; se ofrecen los Proyectos que ya han enviado Eventos), límite, umbral de aviso (en %) y acción; valida en el momento y muestra los errores del servidor junto al campo;
- botones **Desactivar / Activar**, **Editar** y **Borrar** (con confirmación) en cada fila;
- si el Presupuesto es por Sesión o por Proyecto y hay ámbitos Superados o Cerca, se despliega la lista de ámbitos con su gasto, su estado y un enlace a la Sesión (`/sesiones/<id>`); los Superados con acción *detener* ofrecen **Permitir esta Sesión** (o **Permitir este Proyecto hoy**) y **Ampliar el límite**; una excepción vigente se puede **Quitar**;
- un texto fijo avisa de que el coste es una estimación, de que la comprobación es antes de cada herramienta y de cada prompt (una Sesión puede pasarse del límite en lo que cueste la respuesta en curso) y de que, con Mandarina apagado, los Presupuestos no protegen (ADR-0010).

Se actualiza sola cuando llega por el WebSocket un `budget.state`, y además cada 30 s. Sin Presupuestos muestra un estado vacío con el botón de crear uno; un fallo de carga o de guardado se avisa sin perder lo escrito.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
