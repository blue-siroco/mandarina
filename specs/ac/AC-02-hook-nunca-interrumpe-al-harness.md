# AC-02 — El hook nunca interrumpe al Harness

**Rebanada:** 1 · **ADR:** 0004

Dado que el servidor de Mandarina no responde (apagado, puerto cerrado o colgado),
cuando se ejecuta el hook,
entonces el hook termina con código 0 en menos de 3 s y no escribe nada en stdout (que Claude Code interpretaría). El Evento se descarta.

También sale con 0 si el stdin no es JSON válido.

**Verificación:** test del Adaptador contra un puerto sin servidor y contra un servidor que no responde.
