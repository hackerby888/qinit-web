# Qinit-web

Landing page for [qinit](https://github.com/hackerby888/qinit) — how to install and use it.

- **frontend/** — React + @tanstack/react-query + TailwindCSS (Vite, TypeScript)
- **backend/** — Bun + Express + MongoDB (TypeScript); serves live release info + a visit counter

## Run (dev)

```bash
# backend — Mongo is OPTIONAL (runs without it; just no cache/stats)
cd backend && bun install && cp .env.example .env && bun run dev    # http://localhost:8787

# frontend — proxies /api -> :8787
cd frontend && bun install && bun run dev                           # http://localhost:5173
```

Open http://localhost:5173.

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
