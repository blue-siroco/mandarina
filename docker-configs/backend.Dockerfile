# Imagen completa (no slim) en desarrollo: better-sqlite3 necesita
# toolchain de compilación si no hay binario precompilado para la plataforma.
FROM node:24-bookworm AS development
WORKDIR /app
ENV MANDARINA_DB=/data/mandarina.sqlite
EXPOSE 4000
CMD ["sh", "-c", "npm install && npm run dev"]

FROM node:24-bookworm AS build
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production MANDARINA_DB=/data/mandarina.sqlite
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
VOLUME /data
EXPOSE 4000
CMD ["node", "dist/server.js"]
