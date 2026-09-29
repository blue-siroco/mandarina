# Las Reglas de bloqueo se evalúan en el hook local, no en el servidor

El hook `PreToolUse` evalúa las Reglas de bloqueo localmente y solo informa al servidor del Bloqueo. Centralizar la decisión en el servidor permitiría editar las reglas desde la UI, pero añadiría latencia de red a cada invocación de herramienta y obligaría a elegir entre fail-open (sin protección si Mandarina está caído) o fail-closed (Claude Code inutilizable si Mandarina está caído). Evaluar en local protege siempre.

## Consequences

- Para los Eventos que no bloquean, el hook es best-effort: timeout corto (~1–2 s), descarta el Evento si el servidor no responde y sale siempre con código 0; nunca rompe ni frena al Harness. No hay buffer de reintentos en el MVP.
- La edición de reglas desde la UI queda para la Fase 2 (§2.5) y tendrá que distribuir las reglas al hook.
- Los Presupuestos (1.15) son la única decisión que depende del servidor: el hook consulta su estado y falla abierto (ADR-0010).
