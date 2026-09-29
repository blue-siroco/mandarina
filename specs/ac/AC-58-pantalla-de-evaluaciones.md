# AC-58 — La pantalla Evaluaciones lista, filtra y exporta

**Rebanada:** 12 · **Roadmap:** §1.12 · **Diseño:** spec/design.md

En `/evaluaciones` (grupo *Observar* de la barra lateral):

- filtros de tipo de objeto (Sesión, Turno, Subagente), Puntuación (Todas, +1, −1, Sin puntuar), Etiqueta, Proyecto y periodo (1 h, 24 h, 7 d, 30 d o todo —por defecto—), reflejados en la URL (`?tipo=`, `?puntuacion=`, `?etiqueta=`, `?proyecto=`, `?periodo=`);
- la lista de Evaluaciones con el objeto (tipo y resumen: el prompt o la Tarea), Proyecto, Puntuación, Etiquetas, Nota y fecha; cada fila enlaza al objeto en el detalle de Sesión (`/sesiones/<id>`, con `?pestana=subagentes&subagente=<id>` en un Subagente y `?pestana=linea-de-tiempo` en un Turno);
- el recuento de uso de cada Etiqueta, que al pulsarla la aplica como filtro;
- un botón **Exportar dataset** que descarga el JSONL (AC-56) con los filtros vigentes.

Sin Evaluaciones muestra un estado vacío que explica dónde se crean; un fallo de carga se avisa sin romper la pantalla.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
