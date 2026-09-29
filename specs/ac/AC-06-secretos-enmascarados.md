# AC-06 — Los secretos se enmascaran antes de persistir y difundir

> **Sustituido por [AC-60](AC-60-secretos-con-marcadores-de-tipo.md)** (ADR-0009): el valor ya no aparece como `***`, sino como un marcador con su tipo (`[REDACTED_API_KEY]`…). Se conserva por su historial.

**Rebanada:** 1 · **Roadmap:** §7

Dado un Evento cuyo `payload` contiene un secreto reconocible —API keys (`sk-…`, `sk-ant-…`, `ghp_…`, `github_pat_…`, `AKIA…`, `figd_…`, `xox…-`), cabeceras `Bearer …`, asignaciones `CLAVE=valor` cuyo nombre contiene `KEY`, `SECRET`, `TOKEN` o `PASSWORD`, o propiedades JSON con esos nombres—,
entonces ni lo guardado en SQLite ni lo difundido por WebSocket ni lo devuelto por la API contiene el valor original: aparece como `***`.

**Verificación:** tests unitarios del enmascarado y test de integración de la ingesta.
