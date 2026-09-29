# AC-10 — `docker compose up` levanta el entorno completo

**Rebanada:** 1 · **Roadmap:** §0.7

`docker compose up` levanta backend (hot-reload) en `127.0.0.1:4000`, frontend (hot-reload) en `127.0.0.1:4200` y la base SQLite en un volumen persistente, sin instalar Node ni Angular en el host. El backend monta `~/.claude` en solo lectura (ADR-0003).

**Verificación:** arranque manual y `GET /api/v1/health`.
