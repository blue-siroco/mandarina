# Backend en Node.js en lugar del FastAPI del boilerplate

El repo parte de un boilerplate Angular + FastAPI y parte de los agentes de `.claude/` (p. ej. `backend-api`) asumen FastAPI, pero el roadmap (`spec/roadmap.md` §0.6) fija Node.js como stack obligatorio del servidor de ingesta, la persistencia (SQLite vía `better-sqlite3`) y el WebSocket. Gana el roadmap: es la especificación del producto; el boilerplate era solo una plantilla. Los agentes y la documentación que asumen FastAPI quedan desfasados y deben adaptarse o no usarse para el backend.
