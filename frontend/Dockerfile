# Frontend image: build the SPA (Vite) then serve it static via nginx, proxying /api + /collab to the API.
# Build context MUST be the parent dir containing both `Qinit-web/` and the sibling `Qinit/` (Vite aliases +
# tsc resolve the engine/codecs from ../../Qinit). See docker-compose.yml.
#
#   docker build -f Qinit-web/frontend/Dockerfile -t qinit-web-web ..
FROM oven/bun:1 AS build
WORKDIR /app

# The sibling monorepo (Vite bundles its TS source directly — install its deps so transitive imports resolve).
COPY Qinit /app/Qinit
RUN cd /app/Qinit && bun install

COPY Qinit-web/frontend /app/Qinit-web/frontend
WORKDIR /app/Qinit-web/frontend
RUN bun install --frozen-lockfile
RUN bun run build

FROM nginx:alpine
COPY Qinit-web/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/Qinit-web/frontend/dist /usr/share/nginx/html
EXPOSE 80
