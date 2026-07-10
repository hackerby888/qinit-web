# Backend API image. Build context MUST be the parent directory that contains both `Qinit-web/` and the sibling
# `Qinit/` monorepo (the backend imports @qinit/build via ../../Qinit). See docker-compose.yml / docs/DEPLOY.md.
#
#   docker build -f Qinit-web/backend/Dockerfile -t qinit-web-api ..
#
# NOTE on system contracts: the catalog/source endpoints read core headers. Those are NOT baked in — provision
# them by mounting a host `~/.cache/qinit` (after `qinit up`) into the container and/or setting QINIT_CORE.
# Without them the API serves fine but the system-contract catalog is empty.
FROM oven/bun:1 AS deps
WORKDIR /app

# Sibling toolchain packages (the backend resolves @qinit/build from ../../Qinit/packages).
COPY Qinit /app/Qinit
RUN cd /app/Qinit && bun install

# Backend deps (lockfile-frozen) then source.
COPY Qinit-web/backend/package.json Qinit-web/backend/bun.lock /app/Qinit-web/backend/
RUN cd /app/Qinit-web/backend && bun install --frozen-lockfile
COPY Qinit-web/backend /app/Qinit-web/backend

FROM oven/bun:1
WORKDIR /app/Qinit-web/backend
COPY --from=deps /app /app

ENV NODE_ENV=production
EXPOSE 8787

# Liveness/readiness probe target for orchestrators: GET /ready (503 until Mongo is up).
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "src/index.ts"]
