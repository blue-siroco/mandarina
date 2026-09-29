FROM node:22.23-bullseye AS development

RUN npm install -g @angular/cli@22
WORKDIR /app

FROM development AS build
RUN npm run build

FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
