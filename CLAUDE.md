# Essentials

A personal, local-only set of small apps in one: **Bookmarks** (links),
**Notes** (markdown), **Tasks** (to-dos) and **Contacts** (people), each organised into folders and subfolders and shown as
a file tree, plus a **Calendar** (coloured strips over days, and the tasks
due), **Finances** (money in and out, per category, month by month) and an optional **Chat** (ask an LLM about all of it), with a
navbar to switch between them. The display name is
configurable (`VITE_APP_NAME`, default "Essentials", read via `APP_NAME` in
`src/lib/config.ts`) — never hardcode the product name in UI, titles or
storage keys (app names like "Bookmarks"/"Notes" are fine). It runs on the
owner's machine or home server (Windows natively, or Docker on any OS /
NixOS) and serves on `http://localhost:8008`. Notes used to be a separate
project (`../notes`, port 8009); it was merged in here.

Keep it **clean, minimal and to the point**. Each app does one thing with as
little friction as possible. No accounts, no sync, no tags, no
previews/favicon scraping, no analytics, no rich-text editor. The only
outside calls are opt-in and off until configured (Settings…, or env): the
assistant's LLM (`LLM_API_KEY`), phone reminders via ntfy
(`NTFY_TOPIC`) and a remote database (Turso, Settings → Database; the local
file is the default); the app must work exactly as before without them. A new app must
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
| LLM (opt-in)  | `@anthropic-ai/sdk` (Anthropic) or `fetch` (OpenAI-compatible)    |
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
- **Per app** (`<app>` = `bookmarks`, `notes`, `tasks`, `contacts`; Chat,
  Calendar and Finances are the exceptions: no folders or tree, see their sections): route `src/routes/<app>.tsx`,
  UI in `src/components/<app>/`, hooks in `src/hooks/<app>/`, pure helpers
  and Zod schemas in `src/lib/<app>/`, server code in
  `src/server/<app>.functions.ts` + `<app>.server.ts`, its own tables, its
  own query key (`['<app>', 'tree']`, `<app>TreeQueryOptions`) and its own
  localStorage keys (`<app>:…`, e.g. `useExpandedFolders('<app>')`).
- **Shared**: `lib/config.ts`, `lib/theme.ts`, `lib/shortcuts.ts`
  (`search`, `newFolder`), `hooks/use-expanded-folders.ts`,
  `hooks/use-install-app.ts`, `hooks/use-hydrated.ts`,
  `components/theme-toggle.tsx`, the global
  search (`components/global-search.tsx`, `hooks/use-global-search.ts`,
  `lib/global-search.ts`, `server/search.*.ts`), the assistant
  (`components/assistant-box.tsx`, `lib/assistant.ts`,
  `server/assistant*.ts`, `server/agent*.ts`, `server/changes.server.ts`,
  `server/prompts.server.ts`, `server/llm.server.ts`, `hooks/use-undo-run.ts`,
  `hooks/use-dictation.ts`, `components/dictate-button.tsx`),
  settings
  (`components/settings-dialog.tsx`,
  `lib/settings.ts`, `server/settings.*.ts`), the database switch
  (`components/database-settings.tsx`, `lib/databases.ts`,
  `server/databases.*.ts`, `server/database-copy.server.ts`,
  `components/profile-switcher.tsx`), `ui/`.
- Apps don't import from each other. The tree code (keyboard hook, DnD,
  folder form/select) is duplicated per app on purpose for now (see
  TASKS.md); keep the copies behaving alike.
- **Adding an app**: route + `APPS` entry + its namespaced files + tables
  prefixed with the app name; render `<AppNav />` at the left of its header
  and pass `onSwitchApp` to its tree keyboard hook; call `useGlobalSearch`,
  render `<GlobalSearch>` and the header search button, and add its folders
  and items to `search.server.ts`; render `<AssistantBox>` under the header
  and prefetch `assistantEnabledQueryOptions` in its loader; add its page to
  `PAGES` in `public/sw.js` (bump the cache name).

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
- `task_folders` (same shape) / `tasks` — `id`, `title`, `description` (plain
  text, `''` = none), `folderId`, `position`, `completedAt?` (set = done),
  `dueAt?` (due date + time; drives the colour, the calendar and the
  reminder), `remindMinutes?` (minutes before `dueAt` to remind; 0 = at
  the due time, the default; null = no reminder), `remindedAt?` (set once
  the reminder was pushed; cleared when `dueAt` or `remindMinutes`
  changes), timestamps. Without `dueAt`, `createdAt` drives the
  colour and calendar day. A completed task is deleted for good
  `COMPLETED_TTL_DAYS` (7) after its `completedAt` (`purgeCompleted`,
  lazily whenever the tree loads); open tasks are never removed.
- `assistant_changes` — every change the assistant made, grouped by
  `runId` (one Tell me request / chat turn): `app`, `target` (`item` |
  `folder`), `op` (`create` | `update` | `delete`), `itemId`, `label`,
  `before` (JSON: the row before an update; every row a delete removed,
  folders parents-first), `binIds` (Bin rows a delete made), `undoneAt`.
  `assistant_log.runId` and `chat_messages.runId` point at it.
- `contact_folders` (same shape) / `contacts` — `id`, `name`, `phone`,
  `email`, `address`, `knownFrom` (where the owner knows them from),
  `birthday` (`MM-DD`, or `YYYY-MM-DD` with the year; helpers in
  `src/lib/contacts/birthday.ts`), `description` (free-text context; every
  optional field is `''` when unset), `birthdayRemindedYear` (the year its
  birthday was last pushed; cleared when the birthday changes),
  `folderId`, `position`, timestamps.
- `chat_conversations` (`title` = start of the first message, timestamps) /
  `chat_messages` — `conversationId`, `role` (`user` | `assistant`),
  `content` (markdown), `actions` (JSON: what the turn created / found),
  `error` (a failed turn; content is the error), `createdAt`. Deleting a
  conversation deletes its messages explicitly. A conversation idle for
  `CHAT_TTL_DAYS` (7; by `updatedAt`, i.e. its last turn) is deleted with
  its messages (`purgeOldConversations`, lazily whenever the list loads).
- `calendar_events` — the Calendar's strips: `title` (`''` = none),
  `color` (a key of `CALENDAR_COLORS` in `src/lib/calendar/colors.ts`),
  `startDay` / `endDay` (inclusive local days as `YYYY-MM-DD` text: no
  times, no timezone), `remindedDay` (the `startDay` its day-before
  reminder was pushed for; moving the strip re-arms it), timestamps. No
  folders, no bin.
- `finance_entries` — money in / out (`kind` `expense` | `income`),
  `cents` (whole cents, > 0), `currency` (`CURRENCIES`, default `EUR`; never
  converted), `title` (`''` = none), `category` (a key of `CATEGORIES` in
  `src/lib/finances/categories.ts`; `uncategorized` by default), `day`
  (local `YYYY-MM-DD`), `subscriptionId` (set on a subscription's charge),
  timestamps. Only this month's (and later) rows exist: see `finance_months`.
- `finance_months` — a past month's report: `month` (`YYYY-MM`), `kind`,
  `category`, `currency` (the primary key together), `cents`, `count`.
  `loadFinances` folds every entry before the current month (server's
  local day) into it and deletes those entries.
- `finance_subscriptions` — `name`, `cents`, `currency`, `category`
  (default `subscriptions`), `every` (`month` | `year`), `startDay` (first
  charge; then the same day each month / year, `chargeDay`), `chargedDay`
  (the last charge made), timestamps. `loadFinances` inserts each charge
  that fell due as an entry. Deleting one keeps its charges.
- `finance_budgets` — optional monthly budget per expense `category`
  (primary key), `cents` in euros.
- `assistant_log` — one row per "Tell me…" request or chat turn (`source`
  `tell` | `chat`; `finances` for Finances' own AI calls): `text`, `provider`,
  `model`, `ok`, `result` (one line per item done, or the error),
  `inputTokens` / `outputTokens`, `costUsd` (null when unknown),
  `durationMs`, `createdAt`. Kept until cleared from the history dialog.
- `settings` — `key` (primary key, one of `SETTINGS` in
  `src/lib/settings.ts`), `value`, `updatedAt`. Edited in the Settings
  dialog; read on the server with `readSettings()` (`settings.server.ts`),
  where a missing row falls back to the env var of the same name. Also
  holds `ACTIVE_DATABASE` (not in `SETTINGS`): the remote database in use.
- `databases` — remote libSQL databases (Turso / sqld) the data can be
  switched to: `name`, `url`, `authToken` (`''` = none; write-only, the
  browser sees its last 4 characters), timestamps. Like `settings`, only
  ever read from the local file (migrations create both everywhere).
- `links_bin` / `notes_bin` — the **bin**: a copy of each deleted link /
  note (also those inside a deleted folder; folders themselves aren't
  kept) with its `folderId`, `folderPath` (display only) and `deletedAt`.
  Kept for a day (`BIN_TTL_MS` in `src/lib/bin.ts`), purged lazily when a
  bin is read or added to. Restoring re-inserts it at the end of its folder
  (top level if that's gone), keeping its dates (and note views); a link
  comes back without its favourite. The ⋮ menu's "Bin" opens it
  (`src/components/<app>/bin.tsx` → shared `components/bin-dialog.tsx`;
  query key `['<app>', 'bin']`). Tasks and Contacts have no bin.
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
- **Two handles**: `localDb` is always the local file and holds only
  `settings` + `databases` (use it for those, and nothing else). `db` is the
  data, in the database in use: a `Proxy` forwarding to the current
  connection, so Settings → Database can switch it at runtime
  (`setActive`; `connectRemote` checks a remote answers and migrates it
  first). On start the saved choice (`ACTIVE_DATABASE`) is reconnected; if
  it's unreachable the server falls back to the local file and Settings
  shows why (`startupError`). Never keep a builder or prepared statement
  from `db` across requests.
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
the left — an icon per app, its name in a tooltip, the current one
highlighted — then New
folder, New <item>, and a `ButtonGroup` of global search, the ⋮
import/export menu, shortcuts help, theme menu and the profile switcher
(user icon, `ProfileButton`); on phones (below `sm`, every app) the
header stacks: the app select spans the full width, then the buttons
spread edge to edge (`justify-between`; Calendar adds its month row the
same way, and Tasks' view toggles spread too), and New folder / New <item> (and Chat's New chat) are icon-only
(`ICON_ON_PHONES`, label in `aria-label`)), the app's quick list, search box, then the tree. Folders are
`Collapsible` rows (expanded state persisted in localStorage per app), each
row has a hover `DropdownMenu`. Create/edit happens in a `Dialog`, delete
confirms in an `AlertDialog`. Theme: Light/Dark/System dropdown
(`src/lib/theme.ts`, shared by all apps; an inline head script applies it
before first paint). Page titles are `<App> · ${APP_NAME}`.

**Footer** (`components/app-footer.tsx`, every app but Calendar, last in
its `<main>`): the database in use on the left (Local, or the remote's
name; its URL / the local path as a tooltip; `databasesQueryOptions`,
prefetched by each app's loader) and the running version on the right
(`APP_VERSION` in `lib/config.ts`: package.json's version, injected by
Vite's `define` as `__APP_VERSION__`). `mt-auto` keeps it at the bottom,
so the page's `<main>` is `min-h-dvh` (Chat: `h-dvh`).

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
items, grouped by app (`src/components/global-search.tsx`). It doesn't load
the trees: each (debounced) search calls `globalSearch`
(`src/server/search.functions.ts` / `search.server.ts`, shared by all apps),
which returns at most `SEARCH_LIMIT` (20) folders and 20 items per app, with
their folder paths (no note bodies). Every search word must appear in the
name or the item's other text (URL + description, note body, task
description); name matches rank first, then the latest edited — which is
also what an empty search lists. Picking a link opens it
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
with the same hover menu as in the tree (`LinkMenu`); toggled from the link's row menu or `F`
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
  live from the tree query by id. `j`/`k` scroll, `e` edits, `d` deletes. The Download
  menu saves it as `.md` (title as a `# ` heading, then the body) or `.pdf`,
  named after the note (`src/lib/notes/note-file.ts`). The PDF is built in
  the browser with pdfmake (lazy-loaded on first use by
  `components/notes/note-download.ts`): the markdown is parsed to mdast
  (same GFM + line breaks as the preview) and mapped to a pdfmake document —
  real text, Roboto + Courier for code, A4, light. Images become links.
  Its "Print…" / Ctrl+P prints just the note via the browser
  (`note-print.tsx`: a print-only portal, always light, page titled after
  the note so it's the default file name).
- `mode: 'edit'` — `note-form.tsx`, the bookmarks link form scaled up
  (`sm:max-w-3xl`): Title (optional, focused first; Enter moves to the note) + Folder, a formatting toolbar and a
  monospace textarea. Enter continues lists/checklists (Enter on an empty
  item ends the list), Tab/Shift+Tab indent, Ctrl+B/I/K bold/italic/link,
  Ctrl+Enter or Ctrl+S saves and shows the preview. **Ctrl+M** is a format
  mode over the toolbar (`FORMATS`): `h`/`l` (←/→) move the highlight
  (wrapping), `0`/`$` first/last, Enter/Space applies it to the caret's line
  (inline styles wrap the line's text after any list/quote/heading marker,
  via `lineContent`; a selection is used as is), Esc/Ctrl+M cancels without
  closing the dialog. Other keys are swallowed while it's on; it reopens on
  the last format used. **Esc / clicking
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

- **No dated folders**: a task with no folder picked goes to the top level;
  folders need a name. A task's calendar day is `taskDay` = `dueAt ??
createdAt`.
- **Colours** (`taskTone` in `src/lib/tasks/tree.ts`, tokens `--warning` /
  `--success` in `styles.css` next to `--destructive`): green when done.
  With a due date: red once past it, yellow on its day. Without: red after
  3 days open, yellow after 1 (calendar days in the browser's timezone, so
  yesterday's task is "1 day"). Shown on the checkbox and the label next to
  the title (`TaskAge`: `dueLabel` ("tomorrow 09:00", "Fri 15:00") for open
  due tasks, else the age). The server can't know the timezone, so open
  tasks' labels render only after hydration (`useHydrated`); they update on
  the next re-render (e.g. a refetch), with no timer.
- **Views** (`useTaskView`, stored in `tasks:view`): open / completed
  (`t`) × folders / one flat list (`v`), with matching button groups next
  to the search for touch screens. The open view hides folders whose tasks
  are all done (but keeps never-used empty ones); the done view shows only
  folders with completed tasks (`filterStatus`) — at most a week's worth,
  since older completed tasks are purged. The flat list is oldest
  first (completed: latest first). Drag and drop only in open + folders.
  Move up/down steps past hidden (completed) siblings (`shown` in
  `tree-dnd.tsx`).
- **Due** (`date-picker.tsx`, shadcn `Calendar` in a `Popover`, plus an
  `Input type="time"` and a clear button): optional, for new and edited
  tasks; a day without a time is due at `DEFAULT_DUE_HOUR` (09:00).
  `createdAt` is always the creation time. In the calendar `h`/`l` day,
  `j`/`k` week, `m`/`M` month and `y`/`Y` year forward/back move the
  selection (handled in capture, before the calendar's own keys); Enter
  picks. The keys live in `useCalendarKeys`
  (`src/hooks/tasks/use-calendar-keys.ts`), shared with the calendar dialog.
- **Reminders** (`src/server/reminders.server.ts`): once an open task's
  reminder time (`dueAt − remindMinutes`, compared in SQL in seconds)
  passes, it's pushed to `NTFY_URL`/`NTFY_TOPIC` (ntfy app on the phone)
  and `remindedAt` set (the last push); early reminders more than a day
  late are skipped. It's pushed again when it falls due, then every
  `NAG_MINUTES` (10) while it's overdue and still open — dismissing the
  notification doesn't stop it, completing the task does (no reminder =
  no nagging). The body reads "Due in 15 min · <folder>" ("Due now",
  "Overdue by 40 min"), then the description. The form's **Remind** select (shown once a due day is
  picked; `REMIND_OPTIONS` in `src/lib/tasks/tree.ts`): at the due time,
  5/15/30 min, 1/2 hours or 1 day before, or no reminder.
  The Nitro plugin `src/server/reminders.plugin.ts` (registered in
  `vite.config.ts`) runs it every minute from server start by calling the
  `/api/reminders` route through `nitroApp.fetch`. **Don't import the DB
  from the plugin**: it's bundled apart and would open (and migrate) a
  second connection, so it runs every minute regardless and the route does
  nothing until an ntfy topic is set. Settings has "Send test reminder"
  (`testReminder` in `settings.functions.ts`).
- **Calendar** (`calendar-dialog.tsx`, `i` or the header's calendar button):
  a bigger month calendar with a dot per task on its `taskDay` (up to 4,
  coloured by `taskTone`), the selected day's task count, and the same
  keys (a click only selects). No per-day task list: Enter shows them. Enter (or
  "Show") closes it and filters the list to that day's tasks (`filterDay`,
  applied before the search; a chip next to the search shows the day and
  clears it, as does `q`); `a` (or the button) closes it and opens the
  new-task form due that day (`EditorState.date`). It opens on the filtered day, else today. Like the
  global search, it acts once fully closed and doesn't return focus then
  (`returnFocus`, reset when it next opens), so the form keeps focus.
- **Up next** (`up-next.tsx`, `upNext`; the only list above the search):
  one day's open tasks, earliest first, titled with the day ("Up next ·
  today"). Today's, including anything still open from earlier days
  (overdue, or undated and left over); if none, the next day that has any
  (tomorrow, Friday…) — never several future days mixed. The first 9 have
  keys `1`–`9`. After hydration only (the browser's day).
- Clicking a task / `o` / Enter opens its details (`TaskView` in
  `editor-dialogs.tsx`): path, title, description, due/created/completed dates;
  `c` completes, `e` edits, `d` deletes. The form is Task (focused),
  Folder (top level by default), Due (optional) + Remind, Description (plain
  `Textarea`); Enter saves; a new task closes
  the dialog and reveals the task in the tree.
- **Import/export**: `{ format: 1, folders: [{ name, folders, tasks }],
tasks: [{ title, description?, createdAt?, completedAt?, dueAt?,
remindMinutes? }] }` (ISO
  dates, kept so ages survive; past due dates aren't reminded again),
  appended like the other apps.

### References (`@`, every app)

Any text can point at an item: `@bookmark(Name#12)`, `@note(…)`,
`@task(…)`, `@contact(…)` (`src/lib/references.ts`: `REFERENCE_TYPES`,
`splitReferences`, `formatReference`, `plainReferences`). The number is the
item id; without it (typed by hand) the name is looked up. **Typing**:
`ReferenceAutocomplete` (`components/reference-autocomplete.tsx`), rendered
next to a field and given its ref, is on every free-text field (note text,
task / bookmark descriptions, contact context, Tell me, the chat box):
`@` lists the types (filtered as you type; not after a word character, so
emails don't trigger it), picking one inserts `@contact(` and then searches
that app as you type with the global search (same `['search', q]` query),
and picking an item inserts `@contact(Name#id) ` (inserted with
`execCommand`, so undo works). Its keys (↑/↓ or Ctrl+J / Ctrl+K, like
the global search; Enter / Tab; Esc) are native
listeners on the field, so they win over the field's own `onKeyDown` and a
dialog's Esc while the list is open; Esc keeps that `@` closed. The list
is a Base UI `Popover` (primitives, since the shadcn wrapper has no
`anchor`) in a portal, anchored to the caret (measured with a hidden mirror;
flips / shifts to fit), with `initialFocus`/`finalFocus` off so the field
keeps focus. Being a nested popup, it never stretches a dialog's scroll
area and picking from it isn't an outside press for the dialog. **Showing**: a clickable chip (`ReferenceChip` /
`ReferenceText` in `components/reference.tsx`; markdown via the
`remarkReferences` plugin in the notes preview and chat answers; plain text
in task descriptions, contact context, the user's chat messages and Tell me
answer toasts). Labels, snippets and the PDF show `@Name`. **Clicking**
(`useOpenReference`): `resolveReference` (`search.functions.ts` →
`findReference`) finds the item by id, else by name (exact first), then it
opens like a global search pick; a bookmark opens its site (the tab is
opened during the click, then pointed at the URL). Gone: a toast. The
**assistant** is told the syntax (`APP_PROMPT`) and to relate items with
references; `search`, `read_item` and every create return a ready `ref`
string to copy.

### Assistant: tools, edits and Undo (Tell me and Chat)

Both run the same **tool loop** (`runAgent` in `agent.server.ts`, at most
`MAX_STEPS` = 12 model calls per request) with every tool
(`agent-tools.server.ts`): **look-ups** `search` (the global search),
`read_item` (a bookmark / note / task in full, note text capped at 20k
chars), `list_tasks` (status + local due-day range), `list_folders`;
**create / open** (`ACTION_TOOLS`: `create_task`, `create_note`,
`open_item`), `create_bookmark`, `create_contact` (each create takes an
optional `folder_id`, checked against that app's folders by `badFolder`;
none = Unsorted);
**edits** `update_item` (only the fields given: tasks title / description
/ due / remind / done, notes title / text, bookmarks title / url /
description / favourite, any `folder_id` to move), `delete_item`,
`create_folder`, `update_folder` (rename / move), `delete_folder` (with
everything in it). Edits go through each app's own server functions
(validation, cycle guard, Bin for deleted notes / links). The shared prompt
(`APP_PROMPT` in `prompts.server.ts`) says to look things up first, never
invent ids, only delete what was clearly asked for, and that bulk edits are
fine. **Every change is recorded** (`changes.server.ts`: `recordCreate`,
`recordUpdate` with the row before, `deleteItemRecorded` /
`deleteFolderRecorded` with every removed row + the Bin rows made) under
the run's id, returned as `result.runId` with `result.changed`
(`ChangeSummary`). **Undo** (`undoAssistantRun` → `undoRun`) walks a run's
changes newest first: a create is deleted (a created folder only if still
empty), an update's row put back (dates revived), a delete re-inserted with
its original ids and its Bin copies removed; each change is undone once
(`undoneAt`), and what can't be is reported.
**Profiles**: with any remote database set up, `runAgent` adds the
`use_database { database }` tool and a prompt line naming the profiles
(nothing otherwise, so no extra context). Switching makes the run's next
tool calls go to that profile: `withDatabase` (`src/db/index.ts`, an
`AsyncLocalStorage` the `db` Proxy reads first) runs the usual tools
there over `profileHandle` (idle connections kept, shared with
reminders). That's how it looks elsewhere when something isn't found here
and copies / moves items between profiles (read, switch, create; delete
the original to move). Once a run has crossed profiles, references in
what it creates or updates lose their ids (`referencesByName`). Changes
are recorded in the profile they happened in; Undo runs in every profile
(`undoRunEverywhere`). What it did elsewhere carries `database` (created,
found, changed): shown as "in Work", with no Open. `useUndoRun` refreshes every
app after. Undo buttons: the Tell me toast for edits, each chat answer that
changed something ("Undo changes", or "Changes undone"), and each history
row with a run.

### Assistant ("Tell me…", every app)

The assistant is called **Jarvis** (`ASSISTANT_NAME` in
`src/lib/assistant.ts`): the field's placeholder is "Ask Jarvis anything… (@ links to an item)", Chat's
box, empty state, history and Settings use the name, and `APP_PROMPT`
tells the model it is Jarvis and that "Jarvis, …" is the user addressing
it (never part of what to create or search). Use the constant, never the
literal name. ("Tell me" stays the internal name of the field's flow:
`tellPrompt`, `source: 'tell'`.)

**Recall** (`useRequestHistory`): in the field, ↑ with the caret on the
first line steps back through past requests (the history dialog's entries,
Ask Jarvis and Chat, each text once, newest first) and ↓ on the last line
forward, then back to the draft, like a terminal. Loaded on the first ↑
(`fetchQuery`, refetched only after a request invalidated it); a send
resets it. While the `@` list is open it keeps ↑/↓.

The field is laid out exactly like Chat's box (`ChatComposer`) at every
width: the textarea (same placeholder), then a bottom row with the `s`
hint and the mic, and the filled ↑ send button on the right. Keep the two
alike.

**On phones** (below `sm`) the field, like Finances' quick entry, is
floating at the bottom of the screen in a `MobileDock`
(`components/mobile-dock.tsx`), like Chat's box: no border or solid band,
the page fades out under it (a gradient; taps pass through the faded
part) and the field itself is opaque; `z-40`, so over the page but under
dialogs, menus and popovers (`z-50`). The dock puts its
height in `--dock-height` on `<html>`, which `styles.css` uses (phones
only) as the `<main>`'s bottom padding (`main:has([data-mobile-dock])`),
inside its `min-h-dvh`: a short page fits the screen with no scroll, a
long one scrolls clear of it, and
to lift the toasts above it.

`AssistantBox` (`src/components/assistant-box.tsx`) is a field right under
each app's header (not focused on load: `s` or a tap goes in): type or
dictate a sentence, Enter (Shift+Enter = newline).

**Dictation** (here and in Chat's box): a mic button (`DictateButton`,
`useDictation`) uses the browser's own Web Speech API
(`SpeechRecognition` / `webkitSpeechRecognition`; Chrome, Edge, Safari —
not rendered where missing, e.g. Firefox, or on the server). Tap to
listen: words are appended to the field live (interim results) in
`navigator.language`, it stops by itself after a pause, tap again (or
Esc) stops it; sending aborts it. Nothing is sent anywhere by the app
itself (the browser may use its vendor's speech service). The mic needs
a secure origin (https or localhost); a blocked mic is an error toast.
Chromium forks without Google's speech service (Vivaldi, Brave, Opera)
have the API but always fail with `network`; that toast points to Chrome /
Edge / Safari or the OS dictation (Win+H). The
phone keyboard's own mic still works too. `askAssistant`
(`src/server/assistant.functions.ts`) sends it with the browser's time and
timezone to the provider picked in Settings (`LLM_PROVIDER`;
`llm.server.ts`, shared with Chat: neutral `Turn`s / `ToolDef`s converted
per provider, `callModel` returns tool calls, text, tokens and cost):
**OpenAI-compatible** chat completions (`fetch`,
OpenRouter by default, `LLM_BASE_URL`, default model
`anthropic/claude-haiku-5.5`; on OpenRouter `usage: { include: true }` makes
it report the cost) or **Anthropic** (the official `@anthropic-ai/sdk`,
`client.beta.messages.create`, default model `claude-opus-5-5`, effort
`low` on 5.x models, the server-side refusal fallback `fallbacks: "default"`
on the models that take it; cost worked out from `ANTHROPIC_PRICES`, per
model that ran). **`tool_choice` stays `auto`** (the newest Claude models
reject a forced call, so the prompt asks for one) and **no `temperature`**
(Anthropic's current API version rejects it). The tools, in one neutral
shape (`ACTION_TOOLS` in `assistant.server.ts`; carried out by
`assistant-actions.server.ts`, also used by Chat),
`create_task { title, description?, due?, remind_minutes_before? }` (local `YYYY-MM-DD[THH:mm]`,
converted with `zonedTime`), `create_note { title?, body }` and
`open_item { query, app?, folder? }`. The prompt makes a **list** (shopping,
packing…) **one note** with a `- [ ] item` checklist, never several tasks;
separate unrelated actions stay separate tasks. **Filing** (`APP_PROMPT`):
before creating, the model calls `list_folders` for the app and passes a
`folder_id`: the folder the user named, else an existing folder that fits
the topic (even roughly; the most specific subfolder), else — only for a
clear, lasting topic — a new short, general folder it creates first
(`create_folder`, in the style of the existing names, never per item).
With nothing fitting it leaves `folder_id` out and the item goes into the
top-level **Unsorted** folder of its app (`UNSORTED_FOLDER`, found
case-insensitively or created: `ensureTopFolder` in each app's server
file). The created item carries its `folder` path for the toast / chat
marker. It now runs the tool loop above
(`tellPrompt` in `assistant.server.ts`), so it can also edit, delete and
answer quick questions. Edits show one toast listing the changes with
**Undo**; an answer with nothing done shows as a toast. On success the field clears, the trees
are invalidated and a toast per item offers **Open** (`requestOpen`, like
the global search).

**Find / open** ("open my packing list", "find the dentist task", "go to
the GitHub link"): `open_item` runs the global search (`search()` from
`search.server.ts`) and `findOne` picks the best match: in the named app
if any, an item unless a folder was asked for, a name containing every
word first, then the search's order (latest edited). If nothing has
every word ("crm toool"), `partialMatch` searches word by word and takes
the name with the most of them (then items, then the shortest name). The result's `found`
list goes back with `created`; the first match opens at once (note/task via
`requestOpen` + navigate, a folder is revealed, a link opens in a new tab;
if the browser blocks that tab, since it's no longer right after the
click, a toast offers "Open link"), any others are toasts with **Open**,
and no match is a "Couldn't find" toast.

**Saved as chats**: every Ask Jarvis request that reached the model is
also saved as a new Chat conversation (`saveTurn` in `chat.server.ts`,
shared with `sendMessage`; failures as an error answer), so it can be read
again and carried on in Chat; `AssistantResult.conversationId` gives the
answer toast an "Open in Chat" button. They expire like any chat
(`CHAT_TTL_DAYS`); the history keeps the log.

**History** (`AssistantHistoryDialog`, every app's ⋮ menu → "Assistant
history…"): every request, failed ones too, is logged in `assistant_log`
by `askAssistant` (`assistant-log.server.ts`; logging never breaks the
request). The dialog lists the latest `HISTORY_LIMIT` (200) with what was
said, the result, model, time taken, tokens and cost, and totals over all
of them; "Clear history" empties it (what was created stays).

Without an API key the field isn't rendered
(`assistantEnabledQueryOptions`, prefetched by each app's loader) and
nothing else changes.

### Contacts (`/contacts`)

People, kept as small as the other apps: name (required), phone, email,
address, **Known from**, **Birthday** and **Context** (plain text), in
folders like everything else. The birthday is a day + month `Select` and
an optional year (`birthday-input.tsx`); the details show it with the age
("· today!" on the day, after hydration). On the day, from
`BIRTHDAY_HOUR` (9:00, the server's local time — `TZ` in Docker) a push
goes out once a year (`sendBirthdays` in `reminders.server.ts`, run with
the task reminders for every profile; 29 Feb on the 28th in other years;
a day the server was off isn't sent late), tapping it opens Contacts.
Jarvis reads and sets it (`birthday` on `create_contact` / `update_item`;
`APP_PROMPT` says birthdays go on the contact, never a task or strip). Clicking a contact / `o` / Enter opens its details
(`ContactView` in `editor-dialogs.tsx`, read live from the tree query):
folder path, name, "Known from …", then the phone (`tel:`), email
(`mailto:`) and address (a Google Maps search, new tab) as tappable rows
with a copy button each, then the context; `e` edits, `d` deletes. The form
is Name (focused), Phone, Email, Known from, Folder, Address, Context;
saving an edit goes back to the details. The row shows the name with
"known from" (else phone / email) muted; its menu has open, edit/move,
copy phone / email, move up/down, delete. No favourites and no bin (a
delete is final). Import/export: `{ format: 1, folders: [{ name, folders,
contacts }], contacts: [{ name, phone?, email?, address?, knownFrom?,
birthday?, description? }] }`, appended like the other apps. The assistant can
search, read, create (`create_contact`, filed like the rest), edit and delete
contacts, with Undo.

### Chat (`/chat`)

The last navbar app (`APPS`), for asking about anything stored. One
conversation per `?c=<id>` (none = new); the list on the left (a dropdown
below `md`), latest first, with a hover delete (confirm, `d` `d`). The
thread uses shadcn's `message`, `bubble`, `marker` and `message-scroller`
(`components/chat/chat-thread.tsx`); answers render as markdown
(`chat-markdown.tsx`, `.markdown` styles). A turn
(`sendChatMessage` → `sendMessage` in `chat.server.ts`) runs the tool loop
above with the last 30 messages as context, then saves the user's message
and the answer. It can look up, create, edit and delete; each answer that
changed something shows what (markers) and an Undo button. Within the loop Anthropic's content
blocks go back unchanged (`Turn.raw`); saved earlier turns are plain text.
The answer (or the error, as an `error` message) is saved with its
`actions`, shown as markers with **Open** buttons (`requestOpen` +
navigate; links open directly), plus its `runId` (`undoable` comes back
with each message from `loadMessages`). Every turn is logged (`source: 'chat'`,
cost summed over its calls). Without an API key the page shows a
"Add an API key" empty state with a Settings button. Its ⋮ menu
(`chat-menu.tsx`) has Settings, Assistant history and Install. Keys (not
while typing / a dialog is open; help: `?` or the header keyboard button,
`components/chat/shortcuts-dialog.tsx`, keep it in sync): `j`/`k` (`↓`/`↑`)
step through the conversations (opening each; arrows scroll the thread
instead when it has focus), `gg`/`G` latest/oldest, `a` new chat, `d` /
`Delete` delete the open one (`d` again confirms), `s` focuses the message
box (Enter sends, Shift+Enter new line, Esc leaves it), `z` global search,
`Shift+H` / `Shift+L` switch apps.

### Calendar (`/calendar`)

A month view of coloured **strips**, each over one day or a range of days
— no times or durations: just "something's on then". Fills
the whole page (not centred like the other apps). The grid is shadcn's
`Calendar` (react-day-picker v10) stretched out (`month-grid.tsx`): weeks
start on Monday, always 6 weeks (`fixedWeeks`), the caption hidden (the
month and its prev / Today / next buttons are in the header). Custom
`Day` cells hold the strips and `DayButton` is the day number (DayPicker
keeps its keyboard focus handling; its focus ring is hidden and drawn as
an outline on the whole day cell instead). Today is the same square cell
(no rounding) with its colours inverted (`bg-primary`, the number in
`primary-foreground`), not a filled circle. Weekends are a touch greyer (`bg-muted`),
their weekday headings darker, and the line between Friday and Saturday
is a little bolder (2px). **Lanes** (`layoutWeeks` in
`src/lib/calendar/layout.ts`, pure): per week, strips sorted by start
(longer first, events before tasks) get the first free lane; every day of
the week gets as many lanes as that week needs, so a strip is drawn once
per week, in its first day there, `span × 100%` wide over the next cells
(grid lines are inset shadows so the cells stay exactly equal), and the
days it covers keep an empty lane. A strip cut by the week edge is squared
off on that side.

- **Adding**: drag over days (pointer events on the cells; the day under
  the pointer is found with `elementFromPoint`, so it works for touch too)
  or click one day; with the keyboard, Enter / Space on a day starts a
  range, moving extends it, Enter again adds it (Esc cancels); `a` adds on
  the focused day (or the range). Either way the dialog
  (`event-dialog.tsx`) opens: Name (optional), Colour (15 swatches,
  shadcn `ToggleGroup`; a new strip starts with the colour last used,
  `calendar:color` in localStorage) and Days (a range `Calendar`). Only the
  days are required. Clicking a strip edits it (change any of it,
  Delete confirms, `d` `d`).
- **Reminders**: with ntfy set up, every strip is pushed the day before
  it starts ("Tomorrow", or "Tomorrow, until Sun 16 Nov (3 days)"; a tap
  opens `/calendar`), from `STRIP_REMIND_HOUR` (09:00) in the server's
  local time (Docker: `TZ` in `compose.yaml`), once per start day
  (`sendStripReminders` in `reminders.server.ts`, run by the same
  `/api/reminders` tick). A missed day is skipped.
- **Tasks** with a due date show as neutral outlined strips on their due
  day (open: ○, done: ✓ struck through), only after hydration (the
  browser's day); clicking one opens it in Tasks (`requestOpen` +
  navigate). Undated tasks aren't shown. The server reads them straight
  from the `tasks` table (`calendar.server.ts`), like the global search.
- One query (`calendarQueryOptions`, key `['calendar', 'data']`): every
  strip plus the dated tasks. The whole grid renders after hydration.
- **Strip list** (`i`, `strips-dialog.tsx`): every strip in a `Command`
  dialog, earliest first (past ones dimmed), opening on the first not
  over yet. The list has focus, not the filter: `j`/`k` (↓/↑), `gg`/`G`,
  Enter / `o` / click goes to it (the month, its first day focused), `e`
  edits, `d` deletes (`DeleteStripDialog`, `d` `d`), `/` filters by name
  or date (Esc back to the list). Each pick runs once the list has fully
  closed (no focus fight); editing / deleting reopens the list after.
- **The assistant** has Calendar tools (`agent-calendar.server.ts`,
  `CALENDAR_TOOLS` in `ALL_TOOLS`, run first by `runTool`):
  `list_calendar` (strips overlapping a local day range; default today +
  90 days), `create_calendar_strip` (title, start / end day, a colour
  only if named; default `DEFAULT_COLOR`), `update_calendar_strip`,
  `delete_calendar_strip`. Changes are recorded as `app: 'calendar'`
  items (`changes.server.ts` maps it to `calendar_events`), so Undo works;
  strips have no `@` references. `APP_PROMPT` says strips are for things
  going on over days with nothing to do (else a task, never both).
- Not (yet) in the global search or `@` references, and no
  `AssistantBox` (the grid gets the room). Its ⋮ menu
  (`calendar-menu.tsx`) has Settings, Assistant history and Install.

### Finances (`/finances`)

Money in and out, kept as small as the rest: **type the amount and what
it was, Enter** (`QuickEntry`, `components/finances/quick-entry.tsx`).
`parseEntry` (`src/lib/finances/money.ts`, pure) reads "12.50 coffee",
"coffee 12,50", "+1800 payroll" (`+` = income, `-` = expense), "$20 book" /
"20 usd book" (a symbol or code sets the currency). Under the field,
everything optional, reset after each entry: the −/+ toggle (expense /
income), currency (`EUR` by default), category (Uncategorized), day
(today), and **Auto-categorize** (✨, only with an API key; remembered in
`finances:auto`): an entry saved without a category but with a
description is then sent to the AI for one (`categorizeFinanceEntries`,
one plain call, after saving, so saving never waits). The ⋮ menu's
"Categorize N with Jarvis" does the month's uncategorized entries in one
call. **The AI is never called otherwise.**

- **Month view**: In / Out / Left, then a shadcn chart donut
  (`month-report.tsx`, recharts `Pie`, colours from `CATEGORIES`) of
  spending per category with the list next to it (% and, for euros, the
  budget: red when over), then income per category; one block per
  currency (euros first). This month (and later) also lists its entries
  (`entries-list.tsx`; a click edits: `entry-dialog.tsx`, delete confirms
  with `d` `d`). Past months show only totals (`monthLines` /
  `totalsByCurrency` in `src/lib/finances/summary.ts`: entries for current
  months, `finance_months` for past ones).
- **Month end**: whenever the data loads (`loadFinances`, server's local
  day, like the strip reminders), due subscription charges are inserted,
  then every entry before this month is folded into `finance_months` and
  deleted. Adding an entry dated in a past month folds it in on the next
  load.
- **Subscriptions** (`u`, ⋮ menu; `subscriptions-dialog.tsx`): list with
  the next charge and the monthly total, click to edit, "Stop it" deletes;
  add form below (name, amount, currency, every month / year, next charge,
  category).
- **Budgets** (`b`, ⋮ menu; `budgets-dialog.tsx`): optional euro amount
  per expense category, saved on blur / Enter, empty = none.
- **Advice** (`r` or the header button, with an API key; `advice-dialog.tsx`
  → `getAdvice`): one plain call with the month asked about and the five
  before it, subscriptions, budgets and this month's entries, plus an
  optional question ("can I afford…"). The prompt assumes the user knows
  nothing about finance. The answer is shown as markdown and saved as a
  Chat conversation ("Carry on in Chat"); logged as `source: 'finances'`.
- **Jarvis** (`agent-finances.server.ts`, `FINANCE_TOOLS` in `ALL_TOOLS`):
  `add_money_entry` (picks a category itself), `list_finances`,
  `update_money_entry`, `delete_money_entry`, `add_subscription`,
  `delete_subscription`; recorded as `finances` / `subscriptions` items in
  `changes.server.ts` (Undo). So "Jarvis, spent 12 on lunch" works from any
  app's field.
- Not in the global search or `@` references; no `AssistantBox` (the
  quick entry is the field). `callModel` takes an empty tool list for
  plain calls.

**Navbar** (`components/app-nav.tsx`, every app): one icon button per
app (`APPS`), the current one highlighted (`secondary`, `aria-current`),
its name in a shadcn `Tooltip` on hover and as the `aria-label`; no
labels, no scrolling. On phones (below `sm`) it's a shadcn `Select`
instead: the trigger shows the current app's icon and name, the list every
app's icon and name; picking one navigates there.

### Settings (every app's ⋮ menu)

`SettingsDialog` (`src/components/settings-dialog.tsx`) edits the
`settings` table: Assistant (provider select, API key, base URL (hidden for
Anthropic), model; hints follow the provider) and Phone reminders
(ntfy topic, server, token, the app's public URL), plus "Send test
reminder". An empty field means "fall back to the env var / default"
(env values show as placeholders). **Secrets (`secret: true` in `SETTINGS`)
are write-only**: `viewSettings()` sends the browser only whether one is
set (`source`) and its last 4 characters; an empty secret field keeps it,
the ✕ button removes it. Saving invalidates `['settings']` and
`assistantEnabledQueryOptions`, so the field shows up without a restart.
No auth (like everything else): anyone on the LAN can change them, but
can't read the secrets back.

**Database** (`components/database-settings.tsx`, its own section above
the form, with its own actions): Local (the `DATABASE_PATH` file, as
always) plus any number of remote libSQL databases — one entry per Turso
database (name, `libsql://…` URL, token; a group token can be reused), so
several Turso databases can be switched between. Adding one connects and
creates its tables first (`createDatabase`); the pencil edits one (name,
URL, token: an empty token keeps the saved one, ✕ removes it; a new URL or
token must connect first, and if it's the one in use the data moves to the
new connection and the page reloads: `editDatabase`); **Use** switches every app
(`switchDatabase`, server-wide, remembered across restarts) and reloads
the page; the trash button forgets one (not the one in use; its data stays
in Turso). Each database holds its own data; switching copies nothing.
**Copy** (the copy button on every row but the one in use, confirmed in an
`AlertDialog`) replaces all the data in the database in use with that
one's, ids included (`copyDatabase` → `database-copy.server.ts`: every
table but `settings` / `databases`, in `TABLES` order, parents first, as
one `batch` on the raw client, so it's all or nothing), then reloads. Add
new data tables to `TABLES`. Settings, the database list and the
assistant / ntfy keys always stay in the local file. The assistant log
and chats follow the database in use; reminders come from every database
(`sendAllReminders`: the local file and each remote, in use or not, idle
ones on their own kept connections; with any remote set up, each reminder
names its database).

### Keyboard

- Switch apps: `Shift+L` next, `Shift+H` previous — but `Shift+H` first
  collapses all folders if any are open (press again to switch). Wraps
  around; order follows `APPS`. Handled in each app's tree keyboard hook
  (`onSwitchApp`, from `useAppSwitch`).
- Global (`src/lib/shortcuts.ts`): `Ctrl+K` search, `Ctrl+G` new folder
  (⌘ on macOS); new items are `a` in each tree. Avoid browser-reserved
  combos (Ctrl+L/N/T/W/F) when adding more. Ignored when the event was
  already handled (`defaultPrevented`), so the note editor can use Ctrl+B
  for bold.
- Bookmarks tree, vim-style (`src/hooks/bookmarks/use-tree-keyboard.ts`): `j/k` down/up, `h`
  collapse / go to parent, `l` expand / into first child, `gg`/`G` first/last, `n`/`N` next/previous visible link (wraps),
  `o`/`Enter` open or toggle, `a` new link in the hovered/focused folder
  (or the hovered link's folder), `F` add/remove favourite (hovered row, else
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
  but `a` new task (hovered folder, else top level), `c` complete/reopen
  (hovered, else focused), `t` open/completed view, `v` folders/list,
  `i` calendar, `d` or `Delete` delete, `1`–`9` Up next, `q` clears the
  search and the date filter.
- Contacts tree (`src/hooks/contacts/use-tree-keyboard.ts`): the bookmarks
  motions without favourites (`F`, `1`–`9`): `o`/Enter shows the contact,
  `a` new contact, `r` edit, `d` delete, `x`/`p` cut and paste
  (`src/hooks/contacts/use-cut-contact.ts`).
- Finances (`src/routes/finances.tsx`; help in
  `components/finances/shortcuts-dialog.tsx`): `a` focuses the quick
  entry (Enter saves, Esc leaves), `m`/`M` next / previous month, `t` this
  month, `u` subscriptions, `b` budgets, `r` advice, `z`, `f`, `?`,
  `Shift+H/L`.
- Calendar (`src/routes/calendar.tsx`; help in
  `components/calendar/shortcuts-dialog.tsx`): `h`/`l` day, `k`/`j` week
  (arrows too), `m`/`M` (PageDown/PageUp) month, `b`/`e` (Home/End)
  beginning / end of the week — sent to DayPicker as the keys it already handles — `t` today, Enter/Space start / finish a
  range, `a` new strip, `i` the strip list, `o` that day's tasks (navigates to
  `/tasks?day=YYYY-MM-DD`; Tasks' `validateSearch` takes it into its
  day filter and drops it from the URL, so the chip / `q` clear it), Esc
  cancels the range, `z`, `f`, `?`, `Shift+H/L`. In the strip dialog,
  `h`/`l` (`k`/`j`) step through the colours (8 a row) and pick them, and
  the range picker takes `h`/`j`/`k`/`l`, `m`/`M` and `b`/`e` too (`sendDayKey` in
  `components/calendar/day-keys.ts`, shared with the month grid);
  Ctrl+Enter saves from anywhere in it (caught in capture on the form).
- Delete confirmations (every app): `d` presses Delete, so `d` `d`
  deletes (`useConfirmKey` in `src/hooks/use-confirm-key.ts`; repeats of a
  held key are ignored).
- `z` opens the global search on every app (`useGlobalSearch`).
- **Ctrl+Enter** (⌘ on macOS) submits every form from any field
  (`submitOnModEnter` in `src/lib/submit-shortcut.ts`, as the `<form>`'s
  `onKeyDownCapture`, so it wins over the fields' own keys); the note
  editor has its own (Ctrl+Enter / Ctrl+S, save and preview). Use it on
  any new form.
- `f` opens the **app switcher** on every app (`components/app-switcher.tsx`,
  mounted once in `__root.tsx` with its own listener; off while typing or
  while any dialog / menu / listbox is open): the same Dialog + Command as
  the global search, listing `APPS` with the next app highlighted; type to
  filter, ↑/↓ (Ctrl+J/K) and Enter, or press the app's number (1–7).
  That's why Bookmarks' favourite key is `F`.
- `p` opens the **profile switcher** on every app
  (`components/profile-switcher.tsx`, mounted once in `__root.tsx` like the
  app switcher, also opened by the header's user icon): a Command dialog
  listing Local and the databases from Settings → Database, the next one
  highlighted, current marked; type, ↑/↓ and Enter, or its number, switches
  (`switchDatabase`, then the page reloads). Only switching: adding,
  editing and removing stay in Settings. In Bookmarks / Notes / Tasks /
  Contacts a tree's `p` pastes first when something is cut (`paste`
  returns false when nothing is, leaving the key to the switcher).
- `Shift+T` cycles the theme (Light → Dark → System, with a toast) on
  every app: a listener in `ThemeToggle` (each header has one; off while
  typing or while a dialog / menu is open), `nextTheme` in `lib/theme.ts`.
- `@` in a free-text field opens the reference suggestions (see
  References); listed in every app's shortcuts help.
- `s` focuses the "Tell me…" field (when shown); `Esc` in it blurs it so the
  tree keys work again.
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
`VITE_APP_NAME`) go in `.env.local` (gitignored). The assistant and
reminder settings are normally set in the app (Settings…); the
`LLM_*` / `NTFY_*` / `PUBLIC_URL` env vars (server-only, never `VITE_`;
Docker passes them through `compose.yaml`) are only a fallback for
anything not saved there. Don't put `PORT` in
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
