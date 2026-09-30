# AC-98 — Flujo E2E: una Sesión pasa a Esperando, el dashboard avisa y deja de avisar

**Capa:** e2e · **Rebanada:** 16 · **Roadmap:** §1.16

Playwright con red y WebSocket interceptados (`page.route`, `page.routeWebSocket`), sin backend real:

- Con una Sesión Trabajando, un mensaje `event.ingested` de permiso y un `GET /sessions` que ya devuelve `activity = "waiting"` provocan: badge Esperando con herramienta y comando en la tarjeta, aviso en la cabecera con "1 Sesión esperando" y enlace a su detalle, título `(1) Mandarina` y favicon de aviso.
- Se repite desde otra pantalla (Eventos, Presupuestos) y el aviso está también allí.
- Con dos Sesiones esperando, el contador es 2 y el enlace apunta a la más antigua.
- Un `event.ingested` posterior (tool.post) más un `GET /sessions` sin espera hacen desaparecer badge, aviso, contador y favicon.
- Con `AudioContext` doblado en la página: tras una interacción suena una vez al pasar a Esperando; con el interruptor **Silenciar avisos** activo no suena y la preferencia sobrevive a recargar la página.
- Un `turn.ended` sin espera no produce aviso.

**Verificación:** `frontend/e2e` (Playwright).
