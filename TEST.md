┌───────┬────────────────────────────────────────────────────────────────────────────────┬────────────────────────────────────────────────────────┐
│ Modo  │                                   Sirve para                                   │                     Cómo se lanza                      │
├───────┼────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ serve │ Probar el frontend sin backend. Imita la API (/api/v1/events) y el WebSocket   │ API_TARGET=http://mock-api:4000 docker compose         │
│       │ (/ws), arranca con 40 Eventos de historial y genera uno nuevo cada 1,5 s.      │ --profile mock up mock-api frontend                    │
├───────┼────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ send  │ Probar el backend real sin Claude Code. Le envía Eventos simulados, algunos    │ docker compose --profile simulate up                   │
│       │ con secretos para ver el enmascarado.                                          │                                                        │
└───────┴────────────────────────────────────────────────────────────────────────────────┴────────────────────────────────────────────────────────┘

En PowerShell, antes del primer comando: $env:API_TARGET='http://mock-api:4000'.

Cómo son los Eventos simulados:
- Se generan como payloads nativos de Claude Code y pasan por el mismo normalizador que usa el hook, así que el mock también prueba ese mapeo.
- Hay varios Proyectos y Directorios con Sesiones entrelazadas.
- Cada Turno incluye su prompt, llamadas a herramientas (antes y después) y fin de turno.
- Aparecen Subagentes y, en torno a un 10 %, Sesiones Huérfanas que terminan sin cierre. Eso vendrá bien para la rebanada 2.
- Con la misma semilla (--seed) salen siempre las mismas Sesiones. --count y --interval permiten además hacer pruebas de carga.

Lo que he comprobado:
- Tests: los 13 del mock pasan.
- Contra el backend real: le envié 300 Eventos simulados y los aceptó todos, así que cumplen el contrato estricto. Los secretos llegan como export GITHUB_TOKEN=*** y Bearer ***.
- Frontend contra el mock: con el backend parado, la lista muestra las Sesiones de varios Proyectos con sus Subagentes y se actualiza en vivo.
- Entorno: lo he dejado otra vez con el frontend apuntando al backend real.

Otros cambios:
- Proxy configurable: proxy.conf.json pasa a ser proxy.conf.mjs y lee API_TARGET para decidir si el frontend habla con el backend real (por defecto) o con el mock.
- Frontend independiente: ya no arranca el backend automáticamente al levantarse, para poder usarlo solo con el mock. docker compose up sigue levantando los dos.
- Prism: pasa del perfil mock al perfil prism.
- Documentación y CI: he añadido una sección al README.md, el mock-server/README.md con todas las opciones, una nota en CLAUDE.md y un job de CI para los tests del mock.