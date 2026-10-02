# Qinit-web

Landing page for [qinit](https://github.com/hackerby888/qinit) — how to install and use it.

- **frontend/** — React + @tanstack/react-query + TailwindCSS (Vite, TypeScript)
- **backend/** — Bun + Express + MongoDB (TypeScript); serves live release info + a visit counter

## Run (dev)

The site, the docs and the IDE need only the frontend:

```bash
cd frontend && bun install && bun run dev                           # http://localhost:5173
```

Open http://localhost:5173.

The IDE compiles and runs contracts in the page and keeps projects in the browser. Everything the backend adds
(sign-in and cloud projects, share links and live collab, GitHub import/export, the admin page, the
system-contract catalog) is switched off by `BACKEND_ENABLED` in `frontend/src/ide/backend.ts`. Set it to
`true` and run the backend to bring those back:

```bash
# backend — Mongo is OPTIONAL (runs without it; just no cache/stats). The frontend proxies /api -> :8787
cd backend && bun install && cp .env.example .env && bun run dev    # http://localhost:8787
```

## Backend API

| route | what |
|-------|------|
| `GET /api/release/latest` | latest qinit release from GitHub (Mongo-cached 10 min): version, per-platform assets, install cmd, download counts |
| `GET /api/stats` | visit counter (`{ visits }`) |
| `GET /api/health` | `{ ok: true }` |

## Build (prod)

```bash
cd frontend && bun run build      # -> frontend/dist (static)
cd backend  && bun run start      # serve API; reverse-proxy /api to it, serve frontend/dist from a CDN/nginx
```
