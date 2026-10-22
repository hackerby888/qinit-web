# Qinit-web

Landing page for [qinit](https://github.com/hackerby888/qinit) — how to install and use it.

- **frontend/** — React + TailwindCSS (Vite, TypeScript): landing, docs and the browser IDE
- **backend/** — Bun + Express + MongoDB (TypeScript); serves live release info + a visit counter

## Frontend layout

`frontend/src` groups code by what it does; one folder is one subsystem:

- `ui/` — the IDE's pixel design system (tokens, primitives, modals, toasts, splash); the landing and the docs use the Tailwind theme in `index.css`
- `crash/` — the crash reporter `main.tsx` installs before React renders
- `landing/`, `docs/`, `admin/` — one route each
- `ide/` — the browser IDE. `Ide.tsx` is the shell; `cloud/` holds everything behind `BACKEND_ENABLED`; `compile/`, `engine/`, `calls/`, `workspace/`, `projects/`, `editor/`, `qpi/` and `test-runner/` are its subsystems

Files are kebab-case modules, `PascalCase.tsx` components and `use-*.ts` hooks; no barrel `index.ts` files. `frontend/tests` mirrors the same folders.

## Run (dev)

The site, the docs and the IDE need only the frontend:

```bash
cd frontend && bun install && bun run dev                           # http://localhost:5173
```

Open http://localhost:5173.

The IDE compiles and runs contracts in the page and keeps projects in the browser. Everything the backend adds
(sign-in and cloud projects, share links and live collab, GitHub import/export, the admin page, the
system-contract catalog) is switched off by `BACKEND_ENABLED` in `frontend/src/ide/cloud/backend.ts`. Set it to
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
