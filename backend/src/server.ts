import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildApp } from './app.js';

const databaseFile = process.env.MANDARINA_DB ?? '/data/mandarina.sqlite';
const port = Number(process.env.PORT ?? 4000);
// Dentro del contenedor se escucha en todas las interfaces; el
// docker-compose publica el puerto solo en 127.0.0.1.
const host = process.env.HOST ?? '0.0.0.0';

mkdirSync(dirname(databaseFile), { recursive: true });
const app = await buildApp({ databaseFile, logger: true, claudeHomeMount: process.env.CLAUDE_HOME_MOUNT });
await app.listen({ port, host });
