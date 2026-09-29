# AC-67 — La pestaña Enmascarado cuenta lo que se ha tapado

**Rebanada:** 13 · **Roadmap:** §1.13 · **Diseño:** spec/design.md

En `/seguridad?pestana=enmascarado`:
- el mismo filtro de periodo que la otra pestaña;
- una tabla con una fila por Proyecto y una columna por tipo de marcador (Clave de API, Token, Clave privada, Contraseña, Correo, Teléfono, IBAN, Tarjeta, Identificador), con su total y una fila de totales; el orden por defecto es el de la API;
- un texto que explica que se cuentan los marcadores guardados, que los datos anteriores a ADR-0009 (`***`) no cuentan y que los secretos siempre se enmascaran y los datos personales se configuran con `MANDARINA_MASK_PII`.

Sin marcadores muestra un estado vacío; un fallo de carga se avisa sin romper la pantalla.

**Verificación:** tests de componente y caso de uso (Vitest); E2E Playwright con red interceptada.
