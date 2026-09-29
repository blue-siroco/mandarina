# AC-52 — La API da el estado de la Exportación OTLP

**Rebanada:** 11 · **Roadmap:** §1.11

`GET /api/v1/exporter` devuelve:
- `enabled`, `endpoint_host` (host y puerto del colector, sin ruta, credenciales ni cabeceras) e `include_content`;
- `enabled_since` y `last_exported_at`;
- cuántos Turnos hay `pending`, `exported` y `failed`;
- los 50 Turnos cambiados más recientemente, con su Sesión, Proyecto, estado, intentos y último error.

Con el exportador desactivado responde `enabled: false`, `endpoint_host: null` y todo a cero.

**Verificación:** tests de integración (Vitest).
