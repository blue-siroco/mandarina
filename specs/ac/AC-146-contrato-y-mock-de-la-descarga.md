# AC-146 — El contrato y el mock cubren las descargas

**Capa:** contrato + `mock-server/` · **Rebanada:** 19 · **Roadmap:** §1.18 · **ADR:** 0013

- `specs/api-spec.yaml` describe, antes de implementar, `GET /api/v1/sessions/{id}/export`, `GET /api/v1/events/export` y los dos `.../preview`, con parámetros, cabeceras `Content-Disposition`, tipos de contenido, la cabecera `export` y los códigos `400` y `404`.
- `mock-server/lib/mock-api.mjs` los implementa con los mismos filtros, la misma cabecera, el mismo enmascarado y el mismo tope que el backend (usando los Eventos simulados). Sin Transcripts, el contenido de respuestas y tokens es el sintético del mock.
- Tests del mock que fijan los tipos de contenido, la primera línea del JSONL y el truncado.
- El `README.md` y `mock-server/README.md` mencionan las descargas y que el mock no lee Transcripts.

**Verificación:** `mock-server` `npm test`.
