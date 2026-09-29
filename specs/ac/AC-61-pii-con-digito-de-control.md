# AC-61 — Los datos personales se enmascaran validando su dígito de control

**Rebanada:** 13 · **Roadmap:** §1.13 · **ADR:** 0009

Además de los secretos, se enmascaran datos personales (PII) con estos marcadores. Validar el dígito de control evita tapar números y códigos que solo se le parecen.

| Marcador | Qué sustituye | Validación |
|---|---|---|
| `[REDACTED_EMAIL]` | direcciones de correo | forma `usuario@dominio.tld` |
| `[REDACTED_PHONE]` | teléfonos en E.164 (`+34612345678`, `+34 612 34 56 78`) y móviles o fijos españoles con separadores (`612 345 678`, `612-34-56-78`) | un número de 9 cifras sin separadores ni prefijo no se toca |
| `[REDACTED_IBAN]` | IBAN, con o sin espacios | módulo 97 |
| `[REDACTED_CARD]` | números de tarjeta de 13 a 19 cifras, con espacios o guiones | empiezan por 3, 4, 5 o 6 y pasan Luhn |
| `[REDACTED_ID]` | DNI (`12345678Z`) y NIE (`X1234567L`) | letra de control |

- `MANDARINA_MASK_PII` lista las categorías activas (`email`, `phone`, `iban`, `card`, `id`, separadas por comas); sin definir o vacía están todas, y `none` las desactiva. Los secretos (AC-60) no se pueden desactivar.
- Una categoría desactivada no se toca en ningún sitio: ni en el Adaptador ni en el servidor.
- Un identificador que no pasa su dígito de control (un DNI con la letra mal, una cifra de 16 dígitos que no cumple Luhn, una marca de tiempo en milisegundos) se deja intacto.

**Verificación:** tests unitarios del enmascarado (Vitest y `node:test`) contra las mismas fixtures.
