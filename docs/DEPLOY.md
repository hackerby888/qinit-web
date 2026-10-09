# Deployment

Self-host topology: **nginx (web)** serves the built SPA and reverse-proxies `/api` + the `/collab` WebSocket to
the **API** (Bun/Express), backed by **MongoDB** (durable storage) and optional **Redis** (cross-instance collab).

```
            ┌── TLS proxy (Caddy/Traefik/LB) ──┐   HTTPS + wss
 client ───▶│            web (nginx)           │──────────────▶ /            SPA
            └──────────────────────────────────┘──────────────▶ /api, /collab
                                                                     │
                                                                  api (:8787)
                                                                   ├── MongoDB
                                                                   └── Redis (optional)
```

## Prerequisites

- The sibling **`Qinit/`** monorepo checked out next to `Qinit-web/` (the API imports `@qinit/build`; the SPA
  bundles the engine from `../../Qinit`). The Docker build context is the parent dir for this reason.
- The **core headers** for the system-contract catalog/source endpoints. Provision on the host with
  `qinit up` (populates `~/.cache/qinit`); compose mounts it read-only into the API. Without them the API
  serves fine but the system-contract catalog is empty. Contract compilation itself happens in the browser
  (`@qinit/compiler` worker) — the API has no compile endpoint.

## Quick start

```bash
cp .env.example .env          # fill in the REQUIRED-IN-PROD values (see below)
# from inside Qinit-web/ :
docker compose up --build     # mongo + redis + api + web; SPA on http://localhost:8080
```

## Build context note

The images build from the **parent** directory (it must contain both `Qinit-web/` and `Qinit/`). Docker reads
`.dockerignore` from the context root, so create **`<parent>/.dockerignore`** to keep the build fast and clean:

```
**/node_modules
**/.git
**/dist
**/.cache
Qinit-web/frontend/dist
```

(Compose already sets `context: ..`; you only add the parent `.dockerignore` once.)

## Production env checklist (`.env`)

Required (the API **refuses to boot** without them in `NODE_ENV=production`):
- `SESSION_SECRET` — strong random, ≥24 chars (`openssl rand -base64 48`). Boot aborts on the dev default.
- `MONGODB_URI` reachable — a failed connect aborts boot (no silent in-memory fallback).

Strongly recommended:
- `CORS_ORIGINS` — your real web origin(s); otherwise only localhost is allowed.
- `FRONTEND_URL` + `OAUTH_CALLBACK_BASE` — your public URLs (OAuth redirects).
- `GOOGLE_/GITHUB_CLIENT_ID/SECRET` — for login (omitted → that provider returns 503).
- `ADMIN_TOKEN` — to enable `/admin`.
- `TRUST_PROXY=1` — set behind a proxy/LB (compose sets it) so rate-limit + CORS see the real client IP.

Tunables: `RL_*` (rate limits), `QINIT_BUILD_*` (sandbox timeout/CPU/mem/file), `QINIT_METRICS_*` /
`QINIT_INCIDENT_TTL_DAYS` (retention), `LOG_LEVEL`. Full list + defaults in `.env.example`.

## TLS / wss

Terminate HTTPS at a reverse proxy in front of the `web` service (Caddy is one line; Traefik/an LB also work).
Once the site is `https://`, the browser upgrades `/collab` to **wss** automatically — the frontend derives the
scheme from `location`. nginx already forwards the WebSocket upgrade headers to the API.

## Health & lifecycle

- `GET /api/health` — **liveness** (process up, always 200).
- `GET /ready` — **readiness** (200 when Mongo is connected, or `QINIT_NO_DB`; else 503). Use for LB/k8s gating;
  the API image's `HEALTHCHECK` targets it.
- **SIGTERM/SIGINT** → graceful drain: stops accepting, finishes in-flight requests, closes the metrics sampler,
  collab sockets, Redis, and Mongo, then exits. Give orchestrators a ≥10s termination grace.

## Logs

Structured JSON lines in production (`{level,ts,msg,...}`), terse human form otherwise. `LOG_LEVEL` filters.
Ship stdout/stderr to your log aggregator.

## Scaling notes (multiple API instances)

- Set `REDIS_URL` — collab fans out across instances and a single-writer lock debounces the cloud write-back.
- Current gaps for >1 instance: the **rate limiter** is per-instance (in-memory) — a shared Redis store is a
  follow-up. Sticky sessions are not required (auth is stateless JWT).

## Core headers (system contracts)

The API image does **not** bake the core headers. Either (a) mount a host `~/.cache/qinit` populated by
`qinit up` (compose default), or (b) build a derived image that runs `qinit up` at build time. Set `QINIT_CORE`
to override the header snapshot path.

## Cloudflare (static site only)

With `BACKEND_ENABLED = false` (`frontend/src/ide/backend.ts`) the site is static and Cloudflare builds and
serves it on every push to `main`. The build needs the sibling `Qinit/` monorepo, which Cloudflare does not
check out, so `scripts/pages-build.sh` fetches it into `.qinit/` (gitignored) and builds from there.
`wrangler.jsonc` points the Worker at `frontend/dist` with SPA fallback (client-side routes get `index.html`).

Dashboard → Workers & Pages → Create → Workers → Import a repository → `qinit-web`:

| Setting | Value |
|---|---|
| Worker name | `qinit-web` (must match `name` in `wrangler.jsonc`) |
| Production branch | `main` |
| Framework preset | None |
| Root directory | *(empty — repo root)* |
| Build command | `bash scripts/pages-build.sh` |
| Deploy command | `npx wrangler deploy` (the default) |
| Build variable | `BUN_VERSION` = `1.3.14` (the Bun CI uses) |

Optional variables: `QINIT_REPO` (default `hackerby888/qinit`) and `QINIT_REF` (default `main`; a sha or tag
holds the IDE on a known Qinit) — the same knobs the CI workflow has.

A push to the **Qinit** repo does not rebuild the site by itself — the next `qinit-web` push picks it up, or
create a Deploy Hook (Settings → Build) and call its URL from Qinit's CI.
