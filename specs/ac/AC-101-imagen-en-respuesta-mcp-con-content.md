# AC-101 — "Incluye imagen" de una Herramienta MCP reconoce los dos formatos de respuesta

**Rebanada:** 9 · **Roadmap:** §1.9

Una invocación MCP (AC-41) `has_image` cuando su `tool_response` trae algún bloque `type: "image"`, tanto si la respuesta es un array de bloques de primer nivel como si es un objeto `{content: [...]}`. Vale igual para la consulta del repositorio (SQL) que para el cálculo de dominio, y para el mock. Una respuesta con `content` que no es un array, o sin bloques `image`, no la marca.

**Verificación:** tests de dominio e integración (Vitest) con ambos formatos; test del mock.
