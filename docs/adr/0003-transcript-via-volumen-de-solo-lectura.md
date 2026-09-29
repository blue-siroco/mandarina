# El backend lee los Transcripts montando `~/.claude` en solo lectura

Los datos del panel de detalle (modelo, tokens, % de contexto) se leen del Transcript bajo demanda, y el Transcript vive en la máquina del desarrollador mientras el backend corre en Docker. Decidimos montar `~/.claude` como volumen de solo lectura en el contenedor del backend en lugar de que el hook envíe el contenido del Transcript en cada Evento (payloads enormes y duplicados; se descarta también el flag `--add-chat` del roadmap) o de levantar un servicio auxiliar fuera de Docker.

## Consequences

- El backend debe correr en la misma máquina que el Harness observado. Un despliegue remoto o multiusuario obligará a revisar esta decisión.
- La ruta del Transcript que llega en el Evento es una ruta del host; el backend debe traducirla a la ruta del volumen.
