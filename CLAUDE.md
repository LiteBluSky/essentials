# Essentials

A personal, local-only set of small apps in one: **Bookmarks** (links),
**Notes** (markdown) and **Tasks** (to-dos), each organised into folders and subfolders and shown as
a file tree, with a navbar to switch between them. The display name is
configurable (`VITE_APP_NAME`, default "Essentials", read via `APP_NAME` in
`src/lib/config.ts`) — never hardcode the product name in UI, titles or
storage keys (app names like "Bookmarks"/"Notes" are fine). It runs on the
owner's machine or home server (Windows natively, or Docker on any OS /
NixOS) and serves on `http://localhost:8008`. Notes used to be a separate
project (`../notes`, port 8009); it was merged in here.

Keep it **clean, minimal and to the point**. Each app does one thing with as
little friction as possible. No accounts, no sync, no tags, no
previews/favicon scraping, no analytics, no rich-text editor. A new app must
be just as small: something to store, organise and open.

Work is tracked in [`TASKS.md`](./TASKS.md) — read it first, pick the next
unchecked task, and tick it off (`- [x]`) in the same change that completes
it. Add new tasks there rather than doing unplanned work.

## Stack

| Concern       | Choice                                                            |
| ------------- | ----------------------------------------------------------------- |
| Framework     | TanStack Start (React 19, file-based routing, server functions)   |
| Server output | Nitro (node) → `.output/server/index.mjs`                         |
| DB            | SQLite (one file) via `@libsql/client`                            |
| ORM           | Drizzle (`drizzle-orm/libsql`, `drizzle-kit`)                     |
| Data fetching | TanStack Query (SSR-integrated via `router-ssr-query`)            |
| Forms         | TanStack Form + Zod                                               |
| UI            | shadcn/ui (`base-nova`, **Base UI** engine) + Tailwind v4, lucide |
| Markdown      | `react-markdown` + `remark-gfm` + `remark-breaks`, typography     |
| Tooling       | pnpm, ESLint (`@tanstack/eslint-config`), Prettier, TypeScript    |

### UI: always use shadcn components

**Use a shadcn component whenever one fits** — never hand-roll a styled
`div`/`span`/`button` for something shadcn provides. Follow the shadcn skill
(`.claude/skills/shadcn/`) and its rules; the ones that bite most here:

- It's the **Base UI** flavour: custom triggers use `render={<Button />}`
  (not `asChild`); a `Button` rendering an `<a>` needs `nativeButton={false}`;
  `Select` takes an `items` prop and a `{ value: null }` item for "none".
- Check `src/components/ui/` before adding; add with
  `pnpm dlx shadcn@latest add <name>`; read `pnpm dlx shadcn@latest docs <name>`
  when unsure of an API.
- Forms: `FieldGroup` + `Field` + `FieldLabel` + `FieldError`, with
  `data-invalid` on `Field` and `aria-invalid` on the control.
- Icons inside `Button` get `data-icon="inline-start|inline-end"`, no size
  classes. Semantic colour tokens only (`text-muted-foreground`, …), `gap-*`
  not `space-*`, `className` for layout only.
- Toasts: `toast.add({ title, type })` from `@/components/ui/toast` (Base UI
  toast manager; `<Toaster>` wraps the app in `__root.tsx`).
- `src/components/ui/**` is vendored shadcn source — excluded from ESLint and
  Prettier. Don't edit it for app-specific styling; compose around it.

## Apps

Each app is self-contained and namespaced; only the shell is shared.

- **Registry**: `src/lib/apps.ts` (`APPS`: path, name, lucide icon) drives
  the navbar (`src/components/app-nav.tsx`) and app switching
  (`src/hooks/use-app-switch.ts`). `/` redirects to the first app.
- **Per app** (`<app>` = `bookmarks`, `notes`, `tasks`): route `src/routes/<app>.tsx`,
  UI in `src/components/<app>/`, hooks in `src/hooks/<app>/`, pure helpers
  and Zod schemas in `src/lib/<app>/`, server code in
  `src/server/<app>.functions.ts` + `<app>.server.ts`, its own tables, its
  own query key (`['<app>', 'tree']`, `<app>TreeQueryOptions`) and its own
  localStorage keys (`<app>:…`, e.g. `useExpandedFolders('<app>')`).
- **Shared**: `lib/config.ts`, `lib/theme.ts`, `lib/shortcuts.ts`
  (`search`, `newItem`, `newFolder`), `hooks/use-expanded-folders.ts`,
  `hooks/use-install-app.ts`, `components/theme-toggle.tsx`, the global
  search (`components/global-search.tsx`, `hooks/use-global-search.ts`,
  `lib/global-search.ts`), `ui/`.
- Apps don't import from each other. The tree code (keyboard hook, DnD,
  folder form/select) is duplicated per app on purpose for now (see
  TASKS.md); keep the copies behaving alike.
- **Adding an app**: route + `APPS` entry + its namespaced files + tables
  prefixed with the app name; render `<AppNav />` at the left of its header
  and pass `onSwitchApp` to its tree keyboard hook; call `useGlobalSearch`,
  render `<GlobalSearch>` and the header search button, and add its folders
  and items to `GlobalSearch`; add its page to `PAGES` in `public/sw.js`
  (bump the cache name).

## Data model (`src/db/schema.ts`)

One SQLite file holds every app. Bookmark tables keep their original names.

- `folders` (bookmark folders) / `note_folders` — `id`, `name`, `parentId`
  (self-reference, `null` = root), `position`, timestamps. Deleting a folder
  cascades to its subfolders and items. Same shape, so one `Folder` type.
- `links` — `id`, `title`, `url`, `description?`, `folderId` (`null` =
  root), `position`, `favoritePosition?` (set = favourite; orders the
  favourites), timestamps.
- `notes` — `id`, `title` (`''` = untitled: lists show a snippet of the
  body via `noteLabel`), `body` (markdown), `folderId`, `position`,
  `viewCount` + `openedAt` (bumped by `viewNote` when a note's preview
  opens; drive "Recent" / "Most viewed"), timestamps. Recording a view or
  reordering keeps `updatedAt` (it means "edited").
- `task_folders` (same shape; an unnamed folder is named after the local
  date, `YYYY-MM-DD`) / `tasks` — `id`, `title`, `description` (plain
  text, `''` = none), `folderId`, `position`, `completedAt?` (set = done),
  timestamps. `createdAt` drives the colour.
- `position` orders siblings within the same parent (folders and items are
  ordered separately; folders render before items, like a file explorer).
- `notes.server.ts` imports `noteFolders as folders`, so its queries read
  like the bookmark ones.

The dataset is small (one person's data), so each app loads **all its
folders and items (note bodies included) in one server function** and
builds the tree client-side. Don't add pagination or per-folder lazy loading
unless it's actually slow.

## Architecture conventions

- **Server functions**: `src/server/<app>.functions.ts` holds the
  `createServerFn` RPCs + `<app>TreeQueryOptions` (safe to import
  anywhere); `src/server/<app>.server.ts` holds the Drizzle queries
  (server-only — import it only from `*.functions.ts`). Never import `@/db` from a component.
- Moving a folder is guarded server-side against cycles (into itself or a
  descendant); the folder picker also hides those options.
- Use `.validator(zodSchema)` on server functions — **not** the deprecated
  `.inputValidator()` (verified deprecated in the installed version).
- **Zod schemas are shared**: define them once in `src/lib/<app>/schemas.ts` and
  use the same schema for the TanStack Form validator and the server-function
  validator.
- **Query keys / options** live next to the server functions as
  `queryOptions(...)` factories (e.g. `bookmarksTreeQueryOptions`). Routes prefetch
  with `context.queryClient.ensureQueryData(...)` in `loader`; components
  read with `useSuspenseQuery`. Mutations invalidate the tree query.
- A route's `loader` must come **before** `component`/`head` in the options
  object or `Route.useLoaderData()` types collapse.
- Tree helpers (`buildTree`, `filterTree`, `flattenFolders`) are pure
  functions in `src/lib/<app>/tree.ts` (notes adds `quickNotes`,
  `noteSnippet`, `noteLabel`). Note textarea editing helpers (list
  continuation, wrap, indent, task toggling) are pure functions in
  `src/lib/notes/markdown-edit.ts`, applied with `execCommand` so native
  undo keeps working.
- In `beforeLoad`/loaders, always `throw redirect(...)`, never call it bare.
- Imports: `@/…` alias for `src/` (tsconfig `paths`, resolved by Vite via
  `tsconfigPaths`). Files run outside Vite (e.g.
  `drizzle.config.ts`) must use relative imports.
- SQLite: `src/db/index.ts` opens `DATABASE_PATH` (default
  `data/essentials.db`, created if missing) and runs the `drizzle/`
  migrations on startup — no manual DB step on deploy. Schema change: edit
  `schema.ts`, `pnpm db:generate`, commit the migration.
- The running server locks `.output`'s native libsql binary, so
  `pnpm build` fails with `EPERM` while it's up: run `scripts/stop.ps1`
  first, then `install-startup.ps1` after.
- Don't rely on foreign-key cascades: SQLite needs a per-connection pragma
  that libsql doesn't keep, so each `removeFolder` deletes descendants itself.
  Keep deletes of anything with children explicit like that.
- Name/title tie-breaks sort `collate nocase` (case-insensitive).
- No auth. The server listens on all interfaces, so it's reachable from the
  LAN. This is deliberate (the owner accepted it); don't change it
  unasked.

## UI

Each app is one page laid out the same way: header (the **app navbar** on
the left — icon + name per app, the current one highlighted — then New
folder, New <item>, and a `ButtonGroup` of global search, the ⋮
import/export menu, shortcuts help and theme menu; below 500px the buttons wrap under the
navbar), the app's quick list, search box, then the tree. Folders are
`Collapsible` rows (expanded state persisted in localStorage per app), each
row has a hover `DropdownMenu`. Create/edit happens in a `Dialog`, delete
confirms in an `AlertDialog`. Theme: Light/Dark/System dropdown
(`src/lib/theme.ts`, shared by all apps; an inline head script applies it
before first paint). Page titles are `<App> · ${APP_NAME}`.

**Installable app (PWA)**: the manifest is a server route
(`src/routes/manifest[.]webmanifest.ts`, so the name follows
`VITE_APP_NAME`); icons are in `public/` (`icon-192/512.png`,
`icon-maskable-512.png`, `apple-touch-icon.png`, generated from the same
bookmark glyph as `favicon.svg` — keep it). `public/sw.js` is cache-first for
hashed `/assets/*` and network-first (falling back to cache) for everything
else, precaching each app's page (`PAGES`) and never caching redirects, so
the last-loaded pages open offline, read-only. It's registered in
production builds only (`registerServiceWorker` in
`src/hooks/use-install-app.ts`). The ⋮ menu's "Install app…" uses
`beforeinstallprompt` where offered, else shows how (iOS: Share → Add to
Home Screen). Install and the SW need a secure origin (https or localhost) —
plain http on the LAN works as a website only. Bump the cache name in
`sw.js` if its strategy or `PAGES` change.

**Drag and drop** (`src/components/<app>/tree-dnd.tsx`) is native HTML5
DnD, no library. Folders and items are ordered separately (folders always
first), so a folder drops before/after a folder or inside a folder; an item
drops before/after an item or inside a folder; a dashed zone at the bottom
moves to the top level. `resolveMove` turns a drop into
`{ kind, id, parentId, index }` (or null for invalid/no-op); the move server
fn rewrites sibling positions in a transaction and `useMoveBookmark` /
`useMoveItem` applies it optimistically. Disabled while searching.

**Global search** (`z`, or the search button first in the header's button
group, on every app): a `Command` dialog listing every app's folders and
items, grouped by app (`src/components/global-search.tsx`). It loads each
app's tree query (already cached for the current app). Every search word
must appear in the name, folder path or extra text (URL + description, note
body, task description); name matches rank first. Picking a link opens it
in a new tab; anything else is stored with `requestOpen`
(`src/lib/global-search.ts`) once the dialog has closed, then the app is
navigated to and its page's `useGlobalSearch` takes it: an item opens (note
preview / task details), a folder is revealed (search cleared, folder +
ancestors expanded, row focused; Tasks also switches to the folders view).
The app's own search box (`Ctrl+K`, `/`) still filters just its tree.

### Bookmarks (`/bookmarks`)

Links open in a new tab; the row menu has new link/subfolder here,
edit/move, copy URL, favourite, move up/down, delete.

**Favourites**: at most 9 (`MAX_FAVORITES`, enforced server-side in
`setFavorite`). Listed above the search (`favorites-list.tsx`), each row
with the same hover menu as in the tree (`LinkMenu`); toggled from the link's row menu or `f`
(`src/hooks/bookmarks/use-favorite.ts`, optimistic).

**Import/export** (`src/components/bookmarks/import-export-menu.tsx`): JSON
file `{ format: 1, folders: [{ name, folders, links }], links: [{ title, url,
description?, favorite? }] }` — nested, no ids; `favorite` is the 1–9 rank. Export is built client-side
(`toBookmarksFile` in `src/lib/bookmarks/tree.ts`); import is validated by
`bookmarksFile` (client and server) and **appended** after the existing
top-level items in one transaction — it never replaces or dedupes.
Imported favourites go after the existing ones; any past the 9th are
imported as plain links.

### Notes (`/notes`)

Markdown notes. The row menu has new note/subfolder here, open, edit/move,
copy text, move up/down, delete.

**Notes open in a dialog** (`editor-dialogs.tsx`; `EditorState` in
`editor.ts`), never a separate page:

- `mode: 'view'` — the preview: folder path + edited date, the title large,
  a gap, then the rendered markdown (`markdown.tsx`, `.markdown` styles in
  `styles.css`). Task boxes are clickable: `toggleTaskAt` flips `[ ]`/`[x]`
  at the list item's source offset and saves optimistically. Reads the note
  live from the tree query by id. `e` edits, `d` deletes. Export PDF /
  Ctrl+P prints just the note via the browser's "Save as PDF"
  (`note-print.tsx`: a print-only portal, always light, page titled after
  the note so it's the default file name).
- `mode: 'edit'` — `note-form.tsx`, the bookmarks link form scaled up
  (`sm:max-w-3xl`): Title (optional) + Folder, a formatting toolbar and a
  monospace textarea. Enter continues lists/checklists (Enter on an empty
  item ends the list), Tab/Shift+Tab indent, Ctrl+B/I/K bold/italic/link,
  Ctrl+Enter or Ctrl+S saves and shows the preview. **Esc / clicking
  outside saves and closes** (the form registers a save-on-close handler;
  Cancel discards). A blank new note is simply not created.

**Recent / Most viewed** (`quick-notes.tsx`, `quickNotes` in `src/lib/notes/tree.ts`):
4 most recently opened notes (keys `1`–`4`), then the 4 most opened ones not
already in Recent (`5`–`8`). Each row shows the title or a snippet, with the
same hover menu as the tree (`NoteMenu`). Opening a preview anywhere goes
through `openEditor` in `routes/notes.tsx`, which records the view; a new note
starts with one view.

**Import/export** (`src/components/notes/import-export-menu.tsx`, the ⋮ menu): JSON file
`{ format: 1, folders: [{ name, folders, notes }], notes: [{ title?, body }] }`
— nested, no ids, no view counts. Export is built client-side
(`toNotesFile` in `src/lib/notes/tree.ts`); import is validated by `notesFile`
(client and server) and **appended** after the existing top-level items in
one transaction — it never replaces or dedupes.

### Tasks (`/tasks`)

A to-do list. The row menu has open, complete/reopen, edit/move, move up/down
(folders view only), delete; folder rows as in Notes.

- **Today**: the task form's folder picker offers "Today" (the default when
  no folder is pointed at): the top-level folder named after the client's
  local date (`todayName`), created by the server on first use
  (`resolveFolder`; the client sends `today` since the server may be in
  another timezone). Unnamed folders also get the date.
- **Colours** (`taskTone` in `src/lib/tasks/tree.ts`, tokens `--warning` /
  `--success` in `styles.css` next to `--destructive`): red after 3 days
  open, yellow after 1 (calendar days in the browser's timezone, so
  yesterday's task is "1 day"), green when done. Shown on the checkbox and
  the age label. The server can't know the timezone, so open tasks' ages
  render only after hydration (`useHydrated`); they update on the next
  re-render (e.g. a refetch), with no timer.
- **Views** (`useTaskView`, stored in `tasks:view`): open / completed
  (`t`) × folders / one flat list (`v`), with matching button groups next
  to the search for touch screens. The open view hides folders whose tasks
  are all done (but keeps never-used empty ones); the done view shows only
  folders with completed tasks (`filterStatus`). The flat list is oldest
  first (completed: latest first). Drag and drop only in open + folders.
  Move up/down steps past hidden (completed) siblings (`shown` in
  `tree-dnd.tsx`).
- **Up next** (`up-next.tsx`, `upNext`): the 9 oldest open tasks, oldest
  first, keys `1`–`9`; newer ones aren't listed until those are done.
- Clicking a task / `o` / Enter opens its details (`TaskView` in
  `editor-dialogs.tsx`): path, title, description, created/completed dates;
  `c` completes, `e` edits, `d` deletes. The form is Task (focused),
  Folder, Description (plain `Textarea`); Enter saves; a new task closes
  the dialog and reveals the task in the tree.
- **Import/export**: `{ format: 1, folders: [{ name, folders, tasks }],
tasks: [{ title, description?, createdAt?, completedAt? }] }` (ISO dates,
  kept so ages survive), appended like the other apps.

### Keyboard

- Switch apps: `Shift+L` next, `Shift+H` previous — but `Shift+H` first
  collapses all folders if any are open (press again to switch). Wraps
  around; order follows `APPS`. Handled in each app's tree keyboard hook
  (`onSwitchApp`, from `useAppSwitch`).
- Global (`src/lib/shortcuts.ts`): `Ctrl+K` search, `Ctrl+B` new item
  (link / note / task), `Ctrl+G` new folder (⌘ on macOS). Avoid browser-reserved
  combos (Ctrl+L/N/T/W/F) when adding more. Ignored when the event was
  already handled (`defaultPrevented`), so the note editor can use Ctrl+B
  for bold.
- Bookmarks tree, vim-style (`src/hooks/bookmarks/use-tree-keyboard.ts`): `j/k` down/up, `h`
  collapse / go to parent, `l` expand / into first child, `gg`/`G` first/last, `n`/`N` next/previous visible link (wraps),
  `o`/`Enter` open or toggle, `a` new link in the hovered/focused folder
  (or the hovered link's folder), `f` add/remove favourite (hovered row, else
  focused), `1`–`9` open that favourite in a new tab, `r` edit, `d` delete (hovered row, else
  focused; confirms first), `/` search, `q` clear the search. Arrow keys
  mirror hjkl. `x` cuts a link, `p` pastes it into the focused folder /
  after the focused link (top level if nothing focused), `Esc` cancels
  (`src/hooks/bookmarks/use-cut-link.ts`; sticky toast while cut). Rows opt in with
  `data-tree-item`, `data-kind`, `data-id`, `data-parent-id` on their
  focusable element, and `data-tree-row` on the hover area (row + its menu).
- Notes tree, vim-style (`src/hooks/notes/use-tree-keyboard.ts`): `j/k` down/up, `h`
  collapse / go to parent, `l` expand / into first child,
  `gg`/`G` first/last, `n`/`N` next/previous visible note (wraps),
  `o`/`Enter` open or toggle, `a` new note in the hovered/focused folder
  (or the hovered note's folder), `e`/`r` edit, `1`–`8` open a recent / most
  viewed note, `d` delete (hovered row, else focused; confirms first), `/`
  search, `q` clear the search. Arrow keys mirror hjkl. `x` cuts a note,
  `p` pastes it into the focused folder / after the focused note (top level
  if nothing focused), `Esc` cancels (`src/hooks/notes/use-cut-note.ts`; sticky
  toast while cut). Rows opt in with `data-tree-item`, `data-kind`,
  `data-id`, `data-parent-id` on their focusable element, and
  `data-tree-row` on the hover area (row + its menu).
- Tasks tree (`src/hooks/tasks/use-tree-keyboard.ts`): the notes motions,
  but `a` new task (hovered folder, else Today), `c` complete/reopen
  (hovered, else focused), `t` open/completed view, `v` folders/list,
  `d` or `Delete` delete, `1`–`9` Up next.
- `z` opens the global search on every app (`useGlobalSearch`).
- `?` (or the header keyboard button) opens the app's shortcuts help
  (`src/components/<app>/shortcuts-dialog.tsx`) — keep its list in sync
  when adding or changing a shortcut.
- In search: `Enter`/`↓` jumps to the first row, `Esc` clears.
- All of it is off while a dialog is open or while typing in a field.

## Commands

```bash
pnpm dev            # dev server on http://localhost:3000
pnpm build          # production build -> .output/
pnpm start          # run the built server (reads .env.local; PORT env, default 3000)
pnpm db:generate    # write a migration after editing schema.ts
pnpm db:migrate     # apply migrations (the server also does this on start)
pnpm db:studio      # browse data
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm format         # prettier --write + eslint --fix
pnpm generate-routes
pnpm version:patch  # / version:minor / version:major — bump, commit, tag vX.Y.Z
```

After any nontrivial change run `pnpm typecheck && pnpm lint && pnpm build`.
Treat `eslint --fix` output as untrusted — re-run `typecheck` afterwards.

## Environment

See `.env.example`. Nothing is required; overrides (`DATABASE_PATH`,
`VITE_APP_NAME`) go in `.env.local` (gitignored). Don't put `PORT` in
`.env.local` — Vite picks it up and moves the dev server off 3000.
Production uses port 8008: on Windows it's set by `scripts/start.ps1`, run
at logon by the `Essentials` Scheduled Task (`scripts/install-startup.ps1` /
`uninstall-startup.ps1` / `stop.ps1`); in Docker by the `Dockerfile` (data
in the `/data` volume, runs as uid 1000). `.github/workflows/docker.yml`
publishes the image to `ghcr.io/<owner>/<repo>` (i.e. `ghcr.io/liteblusky/essentials` once the repo is renamed) on every `v*` tag
(amd64 + arm64). Keep `.dockerignore` excluding `data/` and `.env*` so
personal data never lands in an image. Deploy steps for Docker, Windows,
Linux, macOS and NixOS are in the README — keep them in sync when changing
any of this.

## Skill loading (TanStack Intent)

Before substantial work on a TanStack library, check for version-matched
guidance shipped with the installed package:

```bash
pnpm dlx @tanstack/intent@latest list
pnpm dlx @tanstack/intent@latest load <package>#<skill>
```
