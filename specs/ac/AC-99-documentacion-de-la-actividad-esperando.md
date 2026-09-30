# AC-99 — El ADR, el vocabulario y la especificación reflejan la Actividad Esperando

**Capa:** docs · **Rebanada:** 16 · **Roadmap:** §1.16

- Existe un ADR nuevo en `docs/adr/` que amplía ADR-0002 con los Tipos de evento de `Notification` y `PermissionRequest`, con sus nombres, el motivo del vocabulario propio, la nota de que `schema_version` sigue en 1 y que el hook no escribe en stdout ni decide el permiso (ADR-0004). ADR-0002 remite al nuevo, como ADR-0006.
- `CONTEXT.md` define **Esperando** dentro de *Actividad de la Sesión* (Trabajando, En pausa o Esperando) y quita `esperando` de sus `_Avoid_`; la lista de *Tipo de evento* incluye los dos Tipos nuevos.
- `specs/mvp-fase1.md` lista la rebanada 16 con AC-85 a AC-99 y los Tipos de evento nuevos en su tabla; el README del Adaptador y el del mock quedan actualizados (AC-86, AC-93).
- Ningún término evitado por `CONTEXT.md` aparece en el código o la UI nuevos.

**Verificación:** revisión de los documentos; grep de los términos `_Avoid_` en los ficheros cambiados.
