# Образ шлюза: Caddy + собранный SPA (на сервере не нужен Node).
# Сборка из корня репозитория: docker build -f deploy/web.Dockerfile .
FROM node:22-alpine AS build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# Типы API (src/api) уже сгенерированы и закоммичены — контракты для сборки не нужны
RUN npm run build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/frontend/dist /srv
