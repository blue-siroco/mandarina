# AC-124 — El aviso de presupuesto de la cabecera permite ampliar el límite y permitir seguir

**Capa:** frontend · **Roadmap:** §1.15 · **Amplía:** AC-83 · **Reutiliza:** AC-76 (`ManageBudgets.raiseLimit`), AC-78 (`ManageBudgets.allow`), AC-82 (propuesta de límite)

- El aviso del peor Presupuesto (Cerca o Superado) incluye el botón **Ampliar límite**. Al pulsarlo aparece un campo con el límite propuesto (el mismo cálculo que en la pantalla Presupuestos: un 25 % por encima de lo gastado y siempre por encima del límite actual), editable, con **Aplicar** y **Cancelar**. Un valor que no sea un número mayor que 0 lo dice y no deja aplicar.
- Si el ámbito superado se detiene (Superado, acción *detener*, activo y sin excepción) y es un Presupuesto por Sesión o de Proyecto y día, incluye también **Permitir esta Sesión** (excepción de esa Sesión) o **Permitir este Proyecto hoy** (excepción del Proyecto hasta el fin del día). En el global del día, en Cerca y con la acción *avisar* no se ofrece: en el global el Proyecto se elige en `/presupuestos`, que sigue enlazado.
- Las dos acciones usan los casos de uso y el puerto de Presupuestos que ya usa la pantalla; no hay endpoints ni lógica nuevos.
- Tras la acción se muestra una confirmación breve («Límite ampliado a ~$80», «Excepción creada…») como `role="status"`, o el motivo del servidor como `role="alert"` si falla. Vive fuera del aviso, porque este desaparece en cuanto el Presupuesto deja de estar Cerca o Superado: la confirmación se retira sola a los 6 s y el error hasta que se cierra. Los botones se desactivan mientras la acción está en curso.
- El aviso se actualiza por el WebSocket existente (`budget.state`) y por el refresco que ya hace `ManageBudgets`.

**Verificación:** tests de componente (Vitest) de `BudgetAlert` con `ManageBudgets` doblado; E2E Playwright con red y WebSocket interceptados.
