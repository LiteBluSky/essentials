# Tasks

Work top to bottom. Tick a box (`- [x]`) in the same change that completes
it. Add new tasks under the right phase instead of doing unplanned work.

## 0. Scaffold

- [x] TanStack Start scaffold (pnpm, ESLint/Prettier, Nitro node output)
- [x] TanStack Query, Form, Table add-ons; Zod
- [x] Drizzle + MySQL (`mysql2` pool, UTC session timezone)
- [x] Schema: `folders` (self-referencing) + `links`
- [x] `.env.example`, `start` / `typecheck` scripts
- [x] CLAUDE.md + this task list
- [x] shadcn (`base-nova`) installed; `@/` is the only import alias

## 1. Database

- [x] Create MySQL database (utf8mb4) and fill in `.env.local`
- [x] `pnpm db:push`
- [ ] Optional seed script (`scripts/seed.ts`) with a few nested folders/links

## 2. Server layer

- [x] `src/lib/schemas.ts` — shared Zod schemas (`folderInput`, `linkInput`,
      update variants, `byId`); http(s) URL, trimmed name, optional title
- [x] `src/server/bookmarks.functions.ts` — `getTree` + `treeQueryOptions`,
      create/update/delete for folders and links (update covers move)
- [x] `src/server/bookmarks.server.ts` — Drizzle queries; cycle guard on
      folder moves; title falls back to hostname; moved items go last
- [x] Reorder support: `moveBookmark` rewrites sibling positions (transaction)

## 3. Tree UI

- [x] `src/lib/tree.ts` — build nested tree, link counts, folder options
- [x] `/` route: loader `ensureQueryData(treeQueryOptions)`, render tree
- [x] Collapsible folder rows; remember expanded state (localStorage)
- [x] Link rows open in a new tab
- [x] Empty state (`Empty`)
- [x] Verify in a real browser: hydration, dialogs, menus, select, toasts,
      drag and drop, keyboard motions

## 4. Editing

- [x] New/edit link form (TanStack Form + shared Zod schema, auto `https://`)
- [x] New/rename folder form
- [x] Delete with confirmation (lists subfolder/link counts)
- [x] Move link/folder via folder picker (`Select`) in the edit dialog
- [x] Invalidate the tree query after mutations; toasts on success/error
- [x] Drag-and-drop reorder/move (native HTML5; optimistic)
- [x] Move up/down menu items (keyboard alternative to dragging)
- [x] Vim motions in the tree (hjkl, gg/G, o) + arrow keys
- [x] `r` on a focused row opens its edit dialog
- [x] `x` cut / `p` paste a link (sticky toast, `Esc` cancels)
- [x] `d` deletes the hovered (or focused) row, via the confirm dialog
- [x] Keyboard shortcuts help: header button + `?` (`h` stays collapse)

## 5. Find

- [x] Search box filtering titles, URLs, notes and folder names (keeps
      matching ancestors visible, forces folders open while searching)
- [x] `Ctrl+K` / `/` focus search, `Enter`/`↓` jumps into results, `Esc` clears
- [x] `q` in the tree clears the search (no need to go back to the box)
- [x] `n` / `N` jump to the next / previous visible link (wraps)
- [x] `Shift+H` collapses all folders (focus moves to the top-level folder)
- [x] `Ctrl+B` new link, `Ctrl+G` new folder
- [x] Favourites (max 9): `f` / row menu toggles, list above the search with
      a star to remove, `1`–`9` opens one in a new tab
- [x] Favourites in import/export (`favorite` rank per link; extras past 9
      import as plain links)

## 6. Theme

- [x] Light/dark follows the OS
- [x] Light/Dark/System theme menu
- [x] Mobile header (<500px): buttons under the title; settings in a
      `ButtonGroup`

## 7. Run on startup (localhost only)

- [x] ~~Bind to `127.0.0.1` only~~ — decided against: LAN access is fine;
      listens on all interfaces (`HOST=127.0.0.1` restricts it if needed)
- [x] `scripts/start.ps1` — sets `PORT=8008`, runs the built server from the
      project dir, restarts it if it exits, logs to `logs/server.log`
- [x] `scripts/install-startup.ps1` — registers a Windows Scheduled Task
      (trigger: at logon, hidden window, restart on failure) that runs the
      start script; plus `scripts/uninstall-startup.ps1`
- [x] Ensure the MySQL Windows service is set to start automatically
- [x] Document the build → install flow in README

## 8. Cleanup

- [x] Trim README to project-specific content
- [x] Remove unused deps/components (`match-sorter-utils`, `react-table`,
      `tooltip`, scaffold `drizzle.svg`)
- [x] Favicon (`public/favicon.svg`)
- [x] Configurable app name (`VITE_APP_NAME`, default "Bookmarks"); neutral
      storage keys; project renamed to `bookmarks`
- [x] Versioning: `pnpm version:patch|minor|major` (bump, commit, tag)
- [x] Import/export bookmarks as JSON (header menu; import adds, never
      replaces)
- [ ] Optional: import a browser HTML bookmark file

## 9. SQLite (zero-config deploy)

- [x] Replace MySQL with SQLite (`@libsql/client`, file `data/bookmarks.db`,
      `DATABASE_PATH` override); drop `mysql2`, `db:push`/`db:pull`
- [x] Migrations in `drizzle/`, applied automatically on server start
- [x] Folder delete cascades in code (FK pragma isn't kept by libsql)
- [x] Move existing MySQL data over (JSON export → import)
- [x] README/CLAUDE.md: no DB setup; backup = Export JSON or copy the file

## 10. Deploy anywhere

- [x] `Dockerfile` (multi-stage, `node:22-slim`, non-root, `/data` volume),
      `.dockerignore`, `compose.yaml`; `packageManager` pins pnpm
- [x] GitHub Action: publish image to GHCR on `v*` tags (amd64 + arm64)
- [x] README: deploy steps for Docker, Windows, Linux (systemd), macOS
      (launchd) and NixOS (`oci-containers`)
- [ ] Optional: native Nix flake + NixOS module (no container)

## 11. Installable app

- [x] Web manifest (server route, follows `VITE_APP_NAME`) + PNG icons
- [x] Service worker: offline read of the last-loaded bookmarks
- [x] "Install app…" in the ⋮ menu (prompt on Android/desktop, hint on iOS)
- [ ] HTTPS on the LAN (e.g. `tailscale serve`) so phones can install it

## 12. Essentials: merge the notes app in

- [x] Rename the app and project to **Essentials** (`VITE_APP_NAME` default,
      package, Docker image/volume, Scheduled Task, DB file `essentials.db`)
- [x] Bring the notes app (`../notes`) in as a second app: per-app
      namespaces (`components|hooks|lib/<app>`, `server/<app>.*`), notes
      tables `note_folders` / `notes` in the same DB
- [x] Routes `/bookmarks`, `/notes`; `/` redirects to the first app
- [x] Navbar (app icons + names, `src/lib/apps.ts` registry) replaces the
      page title
- [x] `Shift+L` next app; `Shift+H` collapses all folders, or goes to the
      previous app when none are open
- [x] `scripts/merge-dbs.mjs`: build `essentials.db` from the two old DBs
- [x] Folder picker is a type-to-filter shadcn `Command` in a `Popover` (both apps; shows the
      parent path while filtering)
- [ ] Optional: share the tree code between apps (`use-tree-keyboard`,
      `tree-dnd`, folder form/select are near-duplicates)

## History of the notes app (before the merge)

### Notes 0. Scaffold (from the bookmarks app)

- [x] Copy the bookmarks project (TanStack Start, Nitro, SQLite/Drizzle,
      shadcn `base-nova`, ESLint/Prettier, scripts, Docker, CI)
- [x] Rename: package `notes`, default name "Notes", `data/notes.db`,
      `notes:` storage keys, port 8009, Scheduled Task `Notes`
- [x] Fresh `0000` migration: `folders` + `notes`

### Notes 1. Server layer

- [x] Schemas: `noteInput` (optional title, markdown body), `moveInput`
      (`folder | note`), `notesFile` import/export format
- [x] `notes.server.ts` / `notes.functions.ts`: tree, folder + note CRUD,
      `viewNote` (view count + last opened), `moveTreeItem`, import

### Notes 2. Tree UI (1:1 with bookmarks)

- [x] Folder/note tree, collapsible folders, hover row menus, drag and drop,
      move up/down, cut/paste, all vim motions, search
- [x] Notes listed by title, or a snippet of the body when untitled

### Notes 3. Notes

- [x] Preview dialog: big title, gap, rendered markdown (GFM + line breaks)
- [x] Tick checklist boxes straight in the preview
- [x] Edit form (bigger dialog): title, folder, toolbar, monospace textarea
- [x] Editor keys: list continuation, Tab indent, Ctrl+B/I/K, Ctrl+Enter
- [x] Esc / click outside saves and closes; Cancel discards; blank new
      notes aren't created
- [x] Recent (1–4) + Most viewed (5–8) above the search, replacing
      favourites
- [x] Shortcuts help lists tree, preview and writing keys
- [x] Export the previewed note as a PDF (print dialog, Ctrl+P)

### Notes 4. Installable app

- [x] Web manifest (server route, follows `VITE_APP_NAME`) + PNG icons
- [x] Service worker: offline read of the last-loaded notes
- [x] "Install app…" in the ⋮ menu (prompt on Android/desktop, hint on iOS)
- [ ] HTTPS on the LAN (e.g. `tailscale serve`) so phones can install it

### Notes 5. Run on startup

- [x] Windows Scheduled Task on port 8009 (`scripts/install-startup.ps1`)
- [x] README: deploy steps for Docker, Windows, Linux, macOS, NixOS

### Notes 6. Later (optional)

- [ ] Export a note / folder as `.md` files
- [ ] Optional seed script with a few nested folders/notes
