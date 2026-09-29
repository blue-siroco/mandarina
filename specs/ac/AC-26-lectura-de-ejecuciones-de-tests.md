# AC-26 — El servidor lee las Ejecuciones de tests de los Eventos `Bash`

**Rebanada:** 5 · **Roadmap:** §1.5 · **ADR:** 0007

Un Evento `tool.post` de `Bash` genera una Ejecución de tests cuando su comando lanza tests (nombra `test`, `spec`, `e2e`, `vitest`, `jest` o `playwright`) y la salida (`stdout` y `stderr`, o `error` si la herramienta falló) trae el resumen de un runner reconocido. Los códigos de color ANSI se ignoran.

| Runner | Tipo de tests | Resumen que se lee | Duración |
|---|---|---|---|
| Vitest | Unitarios | `Tests  1 failed \| 3 passed \| 1 skipped (5)` | `Duration 1.2s` |
| Jest | Unitarios | `Tests: 1 failed, 3 passed, 4 total` | `Time: 1.2 s` |
| `node:test` | Unitarios | `# tests 5` / `ℹ tests 5` con `pass`, `fail`, `skipped`, `todo` | `duration_ms` |
| Playwright | E2E | `3 passed (5.2s)`, `1 failed`, `1 skipped`, `1 flaky` | entre paréntesis |

- Si el comando nombra `e2e`, la Ejecución es de tests E2E sea cual sea el runner.
- Si una misma salida trae varios resúmenes del mismo runner (p. ej. varios paquetes seguidos), se suman.
- Cada Ejecución tiene total, pasados, fallidos y omitidos; el resultado es `failed` si hay algún test fallido (o interrumpido, en Playwright) y `passed` si no.
- De cada test fallido se lee, si aparece, el nombre, el fichero, la primera línea del error y el `AC-*` que cita el nombre. Como máximo 20 por Ejecución.
- Una salida sin resumen reconocible (runner desconocido, fallo antes de ejecutar tests, `cat` de un log) no genera Ejecución. Una salida mal formada nunca rompe la consulta.

**Verificación:** tests de dominio (Vitest) con salidas reales de cada runner, en verde y en rojo.
