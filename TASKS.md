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
- [x] `a` in the Bookmarks / Notes trees: new item, pre-filled with the
      hovered (or focused) folder
- [ ] Optional: share the tree code between apps (`use-tree-keyboard`,
      `tree-dnd`, folder form/select are near-duplicates)

## 13. Tasks app

- [x] Tables `task_folders` / `tasks` (`completedAt`), migration 0003
- [x] Server layer: CRUD, complete/reopen, move, import; "Today" folder
      (named after the client's date) created on first use
- [x] Tree + flat list (`v`), open / completed (`t`), buttons for both
- [x] Age colours: yellow after 1 day, red after 3, green when done
- [x] Checkbox + `c` to complete; details dialog (`o`/Enter/click) with a
      plain-text description
- [x] `a` new task (hovered folder, else Today), task field focused
- [x] "Up next": 9 oldest open tasks, keys `1`–`9`
- [x] Unnamed folders are named after today's date
- [x] Import/export JSON, shortcuts help, navbar entry, service worker page
- [ ] Verify in a real browser (layout on mobile, DnD, toasts)
- [x] Ages count calendar days in the local timezone (yesterday's task is
      "1 day" and yellow), computed in the browser after hydration

## 14. Global search

- [x] `z` / header search button opens a command dialog over every app's
      folders and items, grouped by app
- [x] Picking a link opens it; a note / task opens in its app; a folder is
      revealed and focused in its app's tree
- [x] `z` in each app's shortcuts help
- [x] Shortcuts help: actions wrap instead of scrolling sideways
- [x] Search on the server: at most 20 folders + 20 items per app, refined
      as you type (no whole trees loaded); path at the row's right edge

## 15. Notes: format the line from the keyboard

- [x] Ctrl+M format mode: h/l through the toolbar, Enter applies to the
      caret's line (or selection), Esc cancels; listed in shortcuts help

## 16. Tasks: pick a new task's date

- [x] Date field (shadcn date picker) on the new-task form, today by
      default; saved at the current time of day
- [x] Calendar keys: h/l day, j/k week, m/M month, y/Y year, Enter picks
- [x] Calendar dialog (`i`): month with a coloured dot per task, same keys,
      `a` opens the new-task form on that day
- [x] No dated folders: no folder picked = top level, folders need a name;
      "Today" lists the tasks dated today
- [x] Calendar: Enter / "Show" filters the list to that day (chip by the
      search, `q` clears it)
- [x] The new-task form keeps focus when opened from the calendar (and
      global search picks keep theirs)
- [x] The new-item button hints `a` (the tree key) instead of Ctrl+B
- [x] Drop the Ctrl+B new-item shortcut; `a` is the only one

## 17. Bin: recover deleted links and notes

- [x] Deleted links / notes (also those inside a deleted folder) go to the
      app's bin (`links_bin` / `notes_bin`) for a day, then are purged
- [x] "Bin" in the ⋮ menu: restore (back to its folder, or the top level if
      that's gone), delete forever, empty bin
- [x] `d` confirms a delete dialog (so `d` `d` deletes), hinted on the button
- [x] Editing a note focuses its title first (Enter moves on to the note)
- [x] `j`/`k` scroll the note preview

## 18. Assistant and reminders

- [x] Tasks get an optional due date + time (`dueAt`, migration 0005);
      the form's created "Date" becomes "Due" (also when editing)
- [x] Colours, labels ("tomorrow 09:00"), Today and the calendar follow the
      due date; "Upcoming" lists overdue / due within a week
- [x] Calendar: dots on due days, `a` starts a task due that day (no
      per-day task list: Enter filters to the day)
- [x] Phone reminders via ntfy: pushed once when due (Nitro plugin, every
      minute); "Send test reminder" in Settings
- [x] "Tell me…" field on every app (`s` focuses it): an LLM
      (OpenRouter / OpenAI-compatible) turns a sentence into tasks / notes in
      "Unsorted"; hidden without an API key
- [x] Anthropic as a provider (official SDK; Settings › Provider); no forced
      tool call or temperature (rejected by the newest Claude models)
- [x] Assistant history (`assistant_log`, migration 0008): every request
      with its result, tokens and cost, in a dialog from the ⋮ menu
- [x] Chat app (`/chat`, navbar): saved conversations (migration 0009),
      look-up tools (search, read_item, list_tasks) + create / open, shadcn
      message / bubble / marker / message-scroller; turns logged with cost
- [x] Shared LLM layer (`llm.server.ts`): multi-turn tool calls for both
      providers
- [x] Find / open: best partial match when no item has every word
- [x] Chat keys: j/k through conversations, gg/G, d deletes (d d), ? help
- [x] The assistant can edit and delete anything (items, folders,
      bookmarks), in Chat and Tell me (now the same tool loop); every change
      recorded (`assistant_changes`, migration 0010) and undoable per
      request (chat answer, Tell me toast, history row)
- [x] Lists become one checklist note; "open / find / show …" opens the best
      match (link, note, task or folder) via the global search
- [x] Per-task reminder time (`remindMinutes`, migration 0007): at the
      due time, 5 min … 1 day before, or none; the assistant understands
      "remind me 15 minutes before"
- [x] Settings dialog (every app's ⋮ menu): LLM + ntfy settings stored in
      the DB (`settings` table, migration 0006), env as fallback; secrets
      write-only
- [x] Completed tasks are deleted automatically 7 days after completion
      (`COMPLETED_TTL_DAYS`, purged when the tree loads); open tasks stay
- [x] Chats are deleted automatically 7 days after their last message
      (`CHAT_TTL_DAYS`, purged when the conversation list loads)
- [x] Dictation button (browser Web Speech API) in Ask Jarvis and the chat
      box; hidden where unsupported
- [x] Every Ask Jarvis request is saved as a Chat conversation ("Open in
      Chat" on the answer toast)
- [x] Ctrl+Shift+O starts a new chat with Jarvis (Chat, the desktop panel,
      else opens one in Chat), even while typing
- [ ] Verify on the phone: dictation into the field, ntfy reminder arrives
- [x] Tasks: drop the Upcoming and Today lists; "Up next" shows one day's
      open tasks (today + anything left over, else the next day with any)
- [x] Overdue open tasks are pushed again every 10 minutes until completed
- [x] Reminders come from every database (Local + each remote), not just
      the one in use; the reminder names its database
- [x] Jarvis across profiles: `use_database` (only with a remote set up)
      to look in the other databases and copy / move items between them;
      Undo covers every profile
- [x] Items Jarvis made / changed / found in another profile open from
      their markers, toasts and `@` chips: the reference names its profile
      (`#12@local`), and Open switches to it, then opens the item
- [x] Tasks' flat list as a grid of same-size cards: title and
      description shown, cut short with an ellipsis
- [x] hjkl / arrows move across the tasks card grid
- [x] `u` presses a notification's Undo
- [x] Tasks' flat list: undated to-dos first (dashed card + icon), then
      due ones soonest first
- [x] The assistant files what it creates: an existing folder that fits
      first, else a new one for a clear topic, Unsorted only as a fallback

## 19. Contacts app

- [x] `contact_folders` / `contacts` tables (migration 0011): name, phone,
      email, address, known from, context
- [x] `/contacts` page like Bookmarks (tree, DnD, cut/paste, keys, search,
      import/export), no favourites or bin; details view with tap to
      call / email / map and copy buttons
- [x] In the global search, the assistant (search, read, create, edit,
      delete, Undo) and the offline pages (`sw.js` cache v5)
- [x] Navbar scrolls sideways when the apps don't fit; icons only on phones
- [x] Birthday (migration 0014): day + month, optional year (age shown);
      a phone notification at 9:00 on the day, once a year, from every
      profile; Jarvis reads and sets it
- [ ] Verify in a real browser (phone width: navbar, details view, tel:)

## 22. App switcher

- [x] `f` on every app: command palette of the apps (same component as
      `z`), type or move to pick, 1–6 jumps; Bookmarks' favourite moves to `F`

## 21. Calendar app

- [x] `calendar_events` table (migration 0012): optional name, one of 15
      colours, first and last day (no times, no reminders)
- [x] `/calendar` page, full width: shadcn Calendar month grid with strips
      in lanes spanning their days; tasks with a due date shown on their day
- [x] Drag over days / click a day / Enter…Enter / `a` to add; click a
      strip to edit (name, colour, days) or delete; keys and help dialog
- [x] Navbar entry, offline page (`sw.js` cache v6)
- [x] `o` on a day opens Tasks filtered to that day (`/tasks?day=`)
- [x] Strip dialog: h/j/k/l through the colours and in the range picker
- [x] `i`: list of every strip (vim keys: go to, edit, delete, filter)
- [x] Jarvis can list, create, change and delete strips (with Undo)
- [x] Ctrl+Enter saves every form from any field
- [x] Strips are reminded the day before (ntfy, 09:00 server time,
      `remindedDay`, migration 0015; `TZ` in compose)
- [x] Today: square cell with inverted colours; the focus ring covers the
      whole day instead of the number
- [ ] Verify in a real browser (drag, strips across weeks, phone width)
- [ ] Optional: strips in the global search and the assistant's tools

## 22. Remote database (Turso)

- [x] `databases` table (migration 0013) in the local file; `localDb` for
      settings, `db` forwards to the database in use (switchable at runtime)
- [x] Settings → Database: Local + any number of Turso / libSQL databases
      (add checks the connection and creates the tables, Use switches every
      app and reloads, remove forgets one); choice kept across restarts,
      unreachable at startup falls back to local and says so
- [x] Profile switcher: user icon in every header + `p`, a command palette
      of the databases (switching only; set up in Settings); tree `p`
      pastes only when something is cut
- [x] Edit a database in Settings (name, URL, token; reconnects if in use)
- [ ] Verify against a real Turso database (add, switch, restart, back to
      local)
- [x] Copy: replace the data in the database in use with another one's
      (Settings → Database, confirmed, all or nothing)

## 20. References (`@`)

- [x] `@type(Name#id)` syntax for bookmarks, notes, tasks and contacts;
      hand-typed `@type(Name)` resolves by name
- [x] `@` autocomplete on every free-text field: types, then a live search
      of that app (↑/↓, Enter / Tab, Esc)
- [x] Shown as clickable chips (notes preview, chat, task description,
      contact context, Tell me answers); click opens the item
- [x] The assistant reads, follows and writes references (`ref` in tool
      results)
- [ ] Verify in a real browser (caret placement in the note editor, Esc in
      a dialog, chat box near the bottom)

## 21. Footer

- [x] Footer on every app but Calendar: the database in use (Local / the
      remote's name) on the left, the running version on the right

## 23. Finances app

- [x] `finance_entries` / `finance_months` / `finance_subscriptions` /
      `finance_budgets` (migration 0015)
- [x] `/finances`: quick entry ("12.50 coffee", "+1800 payroll"), optional
      kind / currency / category / day, month view with a donut per category
- [x] Past months folded into per-category totals (entries deleted)
- [x] Subscriptions charged automatically; optional budgets
- [x] AI only on request: auto-categorize toggle, "Categorize N", Advice
      (saved as a chat)
- [x] Jarvis can add, list, change and delete entries and subscriptions
      (with Undo)
- [x] Phones: the quick entry and Ask Jarvis are pinned to the bottom
      (`MobileDock`, under dialogs), with the mic on the left and bigger
      buttons; the quick entry can be dictated too
- [x] Desktop (xl+): Jarvis is a chat panel on the right (one carried-on
      conversation, New / Open in Chat / Hide); also on Finances and Calendar
- [ ] Verify the Jarvis panel in a real browser (layout at 1280px+, toasts,
      collapse, `s`)
- [ ] Verify in a real browser (quick entry on the phone, chart, dialogs)
- [ ] Optional: entries in the global search; CSV export of the reports
- [x] Recurring expenses **and income** (was: subscriptions, always
      expenses): every N days / weeks / months / years, monthly on chosen
      days (the 1st and 15th, the last day, the 2nd Friday, the last working
      day), weekend → Friday before / Monday after, ends on a day or after N
      times (`src/lib/finances/schedule.ts`, migration 0016)
- [x] Money pop-up (`a`, the header's Add button) replaces the typed quick
      entry: −/+ in front of a big till-style amount (digits come in from
      the right), a small "what was it", auto-categorize + category
- [x] What's left at the end of a month carries over into the next (an
      overspend too): Carried over + In − Out = Left
- [x] Jarvis manages all of Finances: `update_recurring`, `set_budget`
      (Undo for budgets too), recurring with full schedules
- [x] Web search toggle on every Jarvis prompt (Ask Jarvis, Chat, the
      panel, Advice): off by default, off again after each send
      (Anthropic's `web_search` server tool, OpenRouter's `web` plugin)
- [ ] Verify in a real browser: the recurring form, the amount pop-up on
      a phone keyboard, carry-over, the web search toggle
- [x] Recurring money is accepted, not added on its own: each due day
      waits in "To accept" (Accept / Skip, `finance_pending`, migration 0017) and is pushed to the phone at 09:00 that day
- [x] Closing a month is the user's step: while last month is open
      nothing can be added to this one (server-side, Jarvis too); "Close
      <month>" folds it into its totals
- [x] Finance tables included in Settings → Database → Copy (`TABLES`)
- [x] Optional: Jarvis can accept / skip due charges and close a month
      (with Undo)
- [ ] Verify in a real browser: To accept, the Close banner, the 09:00
      push on the phone
- [ ] Accounts: which account holds how much (entries tagged with an
      account, transfers between them, balances) — needs a design (see
      below)
- [ ] Investments: holdings and their value over time — needs a design

## 24. Next up

- [x] Invert calendar colours on the current day
- [x] Add reminders for calendar strips
- [x] Add birthday to contact fields
- [x] Swipe left or right to switch the current app on mobile
      (`swipe-apps.tsx`; verify on a phone)
- [x] Improve gestures overall: long press (touch) / right click (PC) on
      any row opens its actions (`RowContextMenu`)
- [x] Calendar: swipe switches app there too (a finger taps a day, no
      range drag)
- [x] Jarvis field on Finances and Calendar on phones (`phonesOnly`)
- [x] Drag and drop on touch screens: a grip on every tree row (all four
      apps) drags with the finger, same moves as the mouse
- [x] Jarvis thinks up a good folder for what it files (creating one when
      none fits); Unsorted only when it can't tell what it's about
- [ ] Verify on a phone: dragging by the grip (into folders, reordering,
      top level, scrolling while dragging)
- [ ] Verify on a phone: long-press menus, swipe on Calendar, the Jarvis
      field on Finances / Calendar
- [x] Revamp Finances: budgets and recurring as tabs on the page, and find
      a use for budgets (Month / Recurring / Budgets tabs; a bar per budget
      with what's left and the pace; a push at 80% and when over)
- [ ] Verify on a phone: the Finances tabs, the budget bars, a budget push
- [x] Savings goals in Finances (Savings tab, `g`; `finance_savings`,
      migration 0019): something to buy with its price, put money in bit
      by bit, a gauge fills until it's ready to buy; separate from budgets
- [x] Optional: Jarvis and Advice see savings goals (with Undo)
- [x] Savings are accounts, not just goals: the goal is optional, putting
      money in is an expense from the wallet (category Savings, comes off
      Left), taking it out is income; entries keep the balance in sync
      (migration 0020); Jarvis manages them (`add_savings`,
      `put_in_savings`, `take_from_savings`, …) and can explain Finances
- [x] Fix: the Calendar's mouse wheel got stuck going back (the month
      step was read after it was reset, when React ran the update late)
- [ ] Verify in a real browser: Put in / Take out, a savings account
      without a goal, Jarvis putting money in and Undo
- [ ] Verify in a real browser: the Savings tab, putting money in, full
- [x] Notes preview: only the note scrolls (header and buttons stay);
      code blocks scroll inside their own box
- [x] Switch apps with `Alt+H` / `Alt+L` (was Shift); `Shift+H` only
      collapses all folders
- [x] Calendar: the mouse wheel flips to the next / previous month
- [x] Calendar: a vertical swipe flips months on touch screens too, and
      every month change slides in (from below / above) instead of jumping
- [ ] Verify on a phone: swiping months on Calendar (and the slide)
- [x] Find out if the mic button can be hold-to-speak on mobile: yes,
      done (tap = as before, hold = listen until let go; verify on a phone)
- [x] Find out if Jarvis can make markdown files as reports when he
      answers in the chat: notes are those; "Save as note" under each
      answer (Unsorted, titled by its heading or the question), and asked
      for a report Jarvis writes it as a note
- [x] Fix reference chips in the chat not being clickable on PC: clicking
      @bookmark / @note / @task / @contact doesn't open the item (Jarvis
      wrote them in backticks, i.e. code: a code span holding just a
      reference is now a chip, and the prompt says plain text)
- [x] Keep the chat scrolled to the bottom when a new message arrives (it
      jumps to the top): no scroll anchors, follow the bottom
- [ ] Verify in a real browser: chips in answers open the item, the chat
      stays at the bottom on send / answer / switching conversation
- [x] Stream chat replies as they're generated: a plain streamed response
      (`/api/chat`, NDJSON events; both providers stream), no AI SDK
- [ ] Verify with the real providers (Anthropic and OpenRouter): the
      answer appears as it's written, tool lines in between
- [x] Copy button on code blocks in the notes preview (one click copies
      the snippet; hover / focus with a mouse, always on touch, not printed)
- [x] Swipe and Alt+H / Alt+L slide the new app in like a Calendar month
      (sideways: next from the right, previous from the left)
- [x] The app slide leaves the header (navbar + buttons) still; only the
      page below it moves
- [ ] Verify in a real browser: the code copy button (hover, phone, print),
      the app slide on Alt+H / Alt+L and on a phone swipe

## 25. Round of fixes (Nov 2026)

- [x] Chat keeps the conversation that was open when you leave and come
      back (`chat:conversation`); "New chat" starts another
- [x] Keyboard shortcuts can be changed in the app: one registry
      (`lib/shortcuts.ts`), kept per browser, edited in the shortcuts dialog
      (click a key, press the new one; reset one or all; clash warning)
- [x] README is the user guide (icon, what it is, install / deploy / run);
      the developer guide moved to `DEVELOPMENT.md`
- [x] Calendar: no "New" button; strips made by picking days (touch: tap
      the first day, then the last); no day picker in the strip form; drag
      a strip to move it, its ends to resize it (touch: hold to grab /
      select); right click or a longer hold opens Edit / Colour / Delete
- [x] Tasks: no key hints in the due date picker
- [x] Stop button on every Jarvis prompt (field, Chat, panel, Advice):
      cancels the request and undoes what it had already changed
- [x] Same space above the app select on Calendar and Chat as elsewhere
- [x] Jarvis writes a task's description first and makes a fitting title
      from it
- [ ] Verify in a real browser: changing a key (and the hints following
      it), Chat reopening the last conversation, Stop mid-request with a
      real provider (changes undone)
- [ ] Verify on a PC and a phone: dragging / resizing strips, tap-tap to
      add, the hold timings (grab 300 ms, menu 900 ms), the strip menu
- [ ] `pnpm build` + restart the server (not run: the server was up)

## 26. Toasts and Jarvis feedback (Nov 2026)

- [x] Esc dismisses the toasts on screen (they keep the app keys waiting
      on purpose); listed in every app's shortcuts help
- [x] A spinner again while Jarvis works (the field: "Thinking…" /
      "Searching the web…"; Chat's box and the panel: next to Stop)
- [x] A web search answer from the Ask Jarvis field opens in Chat instead
      of a 10 s, 300-character toast
- [ ] Verify in a real browser with web search on (OpenRouter): the field
      shows "Searching the web…", then Chat opens on the answer
- [ ] Verify in a real browser: Esc with a toast up (alone, with a dialog
      open, while Jarvis is working, with something cut)

## 27. Passwords, Jarvis bar, pinned chats (Nov 2026)

- [x] Add a password manager (#46): a Passwords app (logins in folders, like
      Contacts), each password + notes encrypted in the browser with a
      master password (scrypt + AES-256-GCM, `@noble`, works over plain
      http too); locks on reload, after 15 min idle or with `L`; fully
      keyboard driven (tree keys + `c` / `u` copy, `O` site, `v` show);
      change master password; unencrypted JSON import / export; never
      reaches Jarvis (not in its search, no tools, no `@` references)
- [ ] Keep navigation items in the same spot across apps (#47): tried
      (one header width for every app, the same shared buttons, the app's
      own buttons sliding in on every app change) and reverted at the
      owner's request; still open
- [x] Jarvis activity indicator (#48): a bar above the header (not a toast,
      so app keys and the swipe stay free) while Jarvis works, on every
      app: Stop (or Esc), then "Open in Chat" for a request that finished
      out of sight; Stop's feedback moved there from the "Cancelled" toast
- [x] Pin chats (#49): pin / unpin in the list (and `P`), pinned first
- [x] Delete chats a week after their last message (#50): already so
      (`CHAT_TTL_DAYS`, by the last message); pinned chats are now kept
- [ ] Verify in a real browser: set / unlock / lock / idle lock, copy keys,
      change master password, import / export round trip, the phone layout
- [ ] Verify in a real browser: the Jarvis bar while switching apps, Stop
      from another app, Esc, "Open in Chat", with the panel open on desktop
- [x] Jarvis fetches a password ("get my password for Google Gmail"):
      `find_password` opens the entry for the user; the model never sees it
- [x] `pnpm build` + restart the server
- [x] A password's website can be a bookmark (`@` in the field suggests
      bookmarks; opening it follows the bookmark's URL), else a typed URL
- [ ] Optional: clear a copied password from the clipboard after a while

## 28. Jarvis reads links, edits notes in place (Nov 2026)

- [x] Jarvis reads a web page (`read_url`): a URL pasted in the prompt or a
      saved bookmark's page, as text (title, description, text, links), to
      learn what it is and create items from it; public addresses only
      (localhost / LAN refused, redirects re-checked), 15 s, capped
- [x] Jarvis edits notes in place: `update_item` takes `append` and
      `replace` (exact find / replace pieces) besides the full `text`
- [x] Global search results go into Jarvis's prompt: `Ctrl+Enter` (or the
      row's @ button) inserts the item's `@reference` into the prompt on
      screen (field, panel or Chat's box), else a new chat
- [x] Passwords: the unlock / choose-master-password field isn't focused
      on load
- [x] Calendar: clicking a task opens its dialog right there (Tasks' own
      details / edit / complete / delete), not in Tasks
- [x] Calendar: `n` / `N` focus the next / previous strip or task in date
      order (flipping months, wrapping)
- [ ] Verify with a real provider: a pasted URL saved as a bookmark /
      summarised as a note; a small note edit with `replace`
- [ ] Verify in a real browser: Ctrl+Enter / @ in the search with the
      field, the panel (open and closed) and Chat; the Calendar task dialog
      and `n` / `N`
- [x] `pnpm build` + restart the server

## 29. Files for Jarvis (Nov 2026)

- [x] Give Jarvis files as context (Chat's box, the panel, the Ask Jarvis
      field): the paperclip, drag and drop anywhere on the page, or paste
      (a screenshot); images (scaled down), PDFs and text files (CSV,
      Markdown, JSON, ICS, VCF…), at most 5. Jarvis reads them and puts what's
      in them into the apps (a receipt → an expense, a card → a contact…);
      it never makes files. Sent with that message only; the message keeps
      just their names (`chat_messages.attachments`)
- [ ] Verify with the real providers (Anthropic and OpenRouter): a photo
      of a receipt, a PDF invoice, a CSV; files only, no text
- [ ] Verify in a real browser: dropping on Chat, the panel and the field
      (phone: the paperclip opens the camera / gallery), pasting a
      screenshot, Stop puts the files back
- [x] `pnpm build` + restart the server

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
- [x] Download the previewed note as `.md` or `.pdf` (no print dialog)

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
