# AC-51 — La exportación corre en segundo plano, se reanuda y reintenta

**Rebanada:** 11 · **Roadmap:** §1.11 · **ADR:** 0008

- Un Turno se exporta cuando lleva al menos 5 s terminado (para que su Transcript esté escrito), o cuando su Sesión pasa a Cerrada o Huérfana con el Turno abierto. Los Turnos terminados antes de activar el exportador (`enabled_since`, que se fija la primera vez que arranca activo) no se exportan.
- La ingesta de Eventos no espera al colector: un colector caído o lento no cambia la respuesta de `POST /api/v1/events`.
- El estado de cada Turno (`pending`, `exported`, `failed`) se guarda en SQLite: al reiniciar el backend no se reexporta lo exportado y se reanuda lo pendiente.
- Si el colector falla (error de red o respuesta distinta de 2xx), el Turno sigue `pending` y se reintenta a los 30 s, 60 s y 120 s. Tras el cuarto intento fallido queda `failed` con el último error, y los demás Turnos se siguen exportando.
- Un Turno exportado no se vuelve a exportar.

**Verificación:** tests de integración del caso de uso contra SQLite en memoria y un colector simulado (Vitest).
