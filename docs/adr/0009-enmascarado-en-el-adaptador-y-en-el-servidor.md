# El enmascarado se hace en el Adaptador y otra vez en el servidor, con marcadores con tipo

Hasta ahora el servidor enmascaraba los secretos al ingerir y los reemplazaba por `***` (AC-06), "para no repetir la lógica en cada Adaptador". El 1.13 amplía los patrones (JWT, claves privadas, PII) y pide que el secreto no salga de la máquina en claro. Decidimos enmascarar **en el Adaptador antes de enviar** y **otra vez en el servidor al ingerir**, con el mismo catálogo de patrones en los dos, y reemplazar por **marcadores con tipo** (`[REDACTED_API_KEY]`, `[REDACTED_EMAIL]`…). Se descartan dos alternativas:

- **Solo en el servidor**: el secreto viaja en claro por HTTP y pasa por la memoria y los logs del backend. Hoy es `localhost`, pero con 7.1 el backend puede estar en otra máquina.
- **Solo en el Adaptador**: los Adaptadores antiguos, los de otros Harness escritos en otro lenguaje y lo que el servidor lee del Transcript quedarían sin enmascarar.

## Consequences

- El catálogo de patrones existe en dos copias con la misma lógica: `adapters/claude-code/lib/mask.mjs` (Node sin dependencias) y `backend/src/domain/mask-secrets.ts`. No pueden ser un único módulo: la imagen del backend se construye con `backend/` como contexto y no ve `adapters/`, y `tsc` no acepta importar un `.mjs` de fuera de su `rootDir`. Para que no diverjan, las dos ejecutan las mismas fixtures (`test/fixtures/masking.json`, que existe en `adapters/claude-code/` y en `backend/`) y un test del Adaptador comprueba que los dos ficheros son idénticos. Un patrón nuevo se añade en las dos copias y en las fixtures.
- Enmascarar dos veces es idempotente: los marcadores no casan con ningún patrón.
- Un Adaptador de otro Harness que no enmascare sigue protegido por el servidor, aunque sus secretos viajen en claro hasta él.
- Lo ya guardado con `***` no se migra. La UI trata `***` y los marcadores igual.
- La PII se puede desactivar por categoría con `MANDARINA_MASK_PII`, que leen el Adaptador y el backend. Los secretos no se pueden desactivar.
- AC-06 cambia: el valor aparece como su marcador, no como `***`.
