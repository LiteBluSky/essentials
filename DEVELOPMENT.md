# Developing Essentials

This is the developer guide: the stack, running it locally, the database and
releasing a version. For what the app is and how to install, deploy and run
it, see the [README](./README.md).

Architecture and conventions are in [`CLAUDE.md`](./CLAUDE.md) (data model,
how each app is laid out, UI rules, keyboard handling); the work log is
[`TASKS.md`](./TASKS.md).

## Stack

| Concern       | Choice                                                          |
| ------------- | --------------------------------------------------------------- |
| Framework     | TanStack Start (React 19, file-based routing, server functions) |
| Server output | Nitro (node) → `.output/server/index.mjs`                       |
| DB            | SQLite (one file) via `@libsql/client`                          |
| ORM           | Drizzle (`drizzle-orm/libsql`, `drizzle-kit`)                   |
| Data fetching | TanStack Query                                                  |
| Forms         | TanStack Form + Zod                                             |
| UI            | shadcn/ui (Base UI engine) + Tailwind v4, lucide                |
| Markdown      | `react-markdown` + `remark-gfm` + `remark-breaks`               |
| LLM (opt-in)  | `@anthropic-ai/sdk` (Anthropic) or `fetch` (OpenAI-compatible)  |
| Tooling       | pnpm, ESLint, Prettier, TypeScript                              |

## Getting started

You need **Node.js 22.9+**, **pnpm** (`npm install -g pnpm`, or
`corepack enable`) and **Git**.

```bash
git clone <repo-url> essentials
cd essentials
pnpm install
pnpm dev          # http://localhost:3000, hot reload
```

The dev server is separate from a deployed instance on 8008, but uses the
same database file by default (`data/essentials.db`, created with its
tables on first start).

## Commands

```bash
pnpm dev              # dev server on http://localhost:3000
pnpm build            # production build -> .output/
pnpm start            # run the built server (reads .env.local; PORT env, default 3000)
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm format           # prettier --write + eslint --fix
pnpm check            # prettier --check
pnpm db:generate      # after editing src/db/schema.ts: write a migration (commit it)
pnpm db:migrate       # apply migrations (the server also does this on start)
pnpm db:studio        # browse the data
pnpm generate-routes  # regenerate the route tree
```

After any nontrivial change: `pnpm typecheck && pnpm lint && pnpm build`.
Re-run `typecheck` after `eslint --fix`.

On Windows, the running production server keeps the SQLite library in
`.output` locked, so `pnpm build` fails with `EPERM` while it's up: run
`scripts\stop.ps1` first, then `scripts\install-startup.ps1` after.

## Project layout

| Path                           | What                                                                     |
| ------------------------------ | ------------------------------------------------------------------------ |
| `src/routes/`                  | One route per app (file-based routing), plus API routes                  |
| `src/components/`              | UI: a folder per app, shared pieces, vendored shadcn in `ui/`            |
| `src/hooks/`                   | React hooks, a folder per app                                            |
| `src/lib/`                     | Pure helpers and Zod schemas, a folder per app; `apps.ts` lists the apps |
| `src/server/`                  | Server functions (`*.functions.ts`) and Drizzle queries (`*.server.ts`)  |
| `src/db/`                      | `schema.ts` and the database connection                                  |
| `drizzle/`                     | Generated migrations (committed)                                         |
| `public/`                      | Icons, `favicon.svg` and the service worker (`sw.js`)                    |
| `scripts/`                     | Windows start / stop / startup scripts, `merge-dbs.mjs`                  |
| `Dockerfile`, `compose.yaml`   | The Docker image and its compose file                                    |
| `.github/workflows/docker.yml` | Publishes the image on version tags                                      |

Each app is self-contained and namespaced; only the shell is shared, and
apps don't import from each other. See `CLAUDE.md` for the details and for
how to add an app.

## Database and migrations

One SQLite file holds every app. `src/db/index.ts` opens `DATABASE_PATH`
(default `data/essentials.db`, created if missing) and runs the `drizzle/`
migrations on startup, so there's no manual database step on deploy.

To change the schema: edit `src/db/schema.ts`, run `pnpm db:generate` and
commit the migration it writes.

## Environment

See `.env.example`. Nothing is required; overrides (`DATABASE_PATH`,
`VITE_APP_NAME`) go in `.env.local` (gitignored). The `LLM_*` / `NTFY_*` /
`PUBLIC_URL` variables are server-only (never `VITE_`) and only a fallback
for what isn't saved in the app's Settings.

Don't put `PORT` in `.env.local`: Vite picks it up and moves the dev server
off 3000. The production port (8008) is set by `scripts/start.ps1` on
Windows and by the `Dockerfile` in Docker.

`VITE_APP_NAME` is build-time: restart dev / rebuild after changing it.
Never hardcode the product name in the UI.

## Docker image

The `Dockerfile` builds on Linux (so the bundle gets the Linux SQLite
binary) and ships only the built server and its migrations; it runs as the
`node` user (uid 1000) with the data in the `/data` volume. Keep
`.dockerignore` excluding `data/` and `.env*` so personal data never lands
in an image.

`.github/workflows/docker.yml` builds it for `linux/amd64` and
`linux/arm64` and publishes it to GitHub Container Registry
(`ghcr.io/liteblusky/essentials`) whenever a `v*` tag is pushed; it can
also be run by hand.

## Releasing a version

With a clean working tree:

```bash
pnpm version:patch   # 0.1.0 -> 0.1.1  (fixes)
pnpm version:minor   # 0.1.0 -> 0.2.0  (new features)
pnpm version:major   # 0.1.0 -> 1.0.0  (breaking changes)
git push --follow-tags
```

Each bumps `version` in `package.json`, commits it as `Release vX.Y.Z` and
tags it `vX.Y.Z`. Pushing the tag runs `.github/workflows/docker.yml`, which
publishes `ghcr.io/liteblusky/essentials:X.Y.Z` (plus `X.Y`, `X` and
`latest`).

The deploy steps for each platform are in the README: keep them in sync
when changing the scripts, the `Dockerfile` or `compose.yaml`.

## Working with coding agents

**Claude Code and the shadcn skill** (Windows): link its copy of the skill
(a junction holds an absolute path, so it isn't committed):

```powershell
New-Item -ItemType Directory -Force .claude\skills | Out-Null
New-Item -ItemType Junction -Path .claude\skills\shadcn -Target (Resolve-Path .agents\skills\shadcn).Path
```

**TanStack Intent**: before substantial work on a TanStack library, check
for version-matched guidance shipped with the installed package:

```bash
pnpm dlx @tanstack/intent@latest list
pnpm dlx @tanstack/intent@latest load <package>#<skill>
```
