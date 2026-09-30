# AC-128 — El Adaptador encadena el `statusLine` previo sin ralentizarlo

**Capa:** adaptador · **Rebanada:** 17 · **Roadmap:** §1.17 · **ADR:** 0012

- Con `MANDARINA_STATUSLINE_CHAIN` (el comando de `statusLine` que la persona ya tenía), `statusline.mjs` lo ejecuta con el mismo stdin y reenvía su stdout como salida propia (y su stderr como stderr), de modo que la línea de estado no cambia.
- La lectura se envía a la vez que corre la cadena, no después; el envío no espera más de 1,5 s (timeout), y el proceso termina cuando acaban la cadena y el envío.
- Un servidor que no responde no retrasa el fin del proceso más allá de ese timeout, y el código de salida es 0.
- Una cadena que falla o no existe no impide el envío ni rompe el Adaptador.
- Sin cadena no imprime nada.
- Con JSON mal formado la cadena se ejecuta igual con el stdin original y no se envía nada.

**Verificación:** `node:test` en `adapters/claude-code/test/statusline.test.mjs` (cadena con `node -e`, servidor lento).
