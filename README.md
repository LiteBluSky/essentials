<p align="center"><img src="public/icon-192.png" width="96" alt=""></p>

<h1 align="center">Essentials</h1>

<p align="center">A handful of small personal apps in one, running on your own machine.</p>

## What it is

Essentials keeps the everyday things in one place: links, notes, to-dos,
people, dates and money. No accounts, no sync, nothing to configure. It runs
on your own computer or home server and serves on
**http://localhost:8008**; the data is one SQLite file, created the first
time the server starts.

- **Bookmarks**: links in folders and subfolders, shown as a file tree. Up
  to 9 favourites sit on top.
- **Notes**: markdown notes in folders, with clickable checklists, a
  preview, and download as `.md` or `.pdf`.
- **Tasks**: a to-do list in folders, with optional due dates and phone
  reminders. Completed tasks are removed after a week.
- **Calendar**: a month view of coloured strips over a day or a range of
  days (no times: just "something's on then"), plus the tasks due. Select
  the days on the calendar to add a strip: drag over them or click a day on
  a PC; on a phone tap the first day, then the last. Drag a strip to move
  it, drag its edges to resize it; right click or a long hold opens a menu
  with Edit and Delete.
- **Contacts**: people in folders: phone, email, address, where you know
  them from, birthday and some context.
- **Passwords**: logins in folders (username, password, website, notes),
  encrypted in your browser with a master password, so the server only
  stores them scrambled. It locks after 15 minutes idle, on reload or with
  `L`; there's no way to recover a forgotten master password. The
  assistant never sees them.
- **Finances**: money in and out per category, month by month, with
  recurring expenses and income, optional budgets and savings accounts.
- **Chat** (optional): ask an assistant about everything you've saved.
  Pin a conversation to keep it at the top; the others are deleted a week
  after their last message.

Switch between them with the navbar at the top, `Alt+H` / `Alt+L`, or a
sideways swipe on a phone. `z` searches all of them at once. Deleted links
and notes go to a **Bin** (⋮ menu) for a day.

Everything below is optional and off until you set it up; the app works
the same without it:

- **Jarvis, the assistant**: a field on every app that turns a typed or
  dictated sentence into a task, note, contact, calendar strip or expense,
  finds and edits things, and answers questions about what you've saved.
  Needs an LLM API key. See [Assistant (Jarvis)](#assistant-jarvis).
- **Phone reminders**: due tasks, birthdays, calendar strips and recurring
  charges pushed to your phone through [ntfy](https://ntfy.sh). See
  [Phone reminders](#phone-reminders).
- **Remote database**: keep the data in [Turso](https://turso.tech) instead
  of the local file, and switch between several databases (e.g. work /
  personal). See [Remote database](#remote-database).

It can also be [installed as an app](#install-as-an-app-phone--desktop) on
a phone or desktop, and then opens offline (read-only).

> **No login.** The server listens on all interfaces, so anyone who can reach
> port 8008 can read and edit everything in it. Keep it on your LAN (or
> behind something like Tailscale); don't forward the port to the internet.

### Keyboard

Every app can be driven from the keyboard, vim-style: `j` / `k` move down
and up, `h` / `l` collapse and expand, `o` or Enter opens, `a` adds, `d`
deletes (`d` again confirms), `/` searches the current app, `z` searches
everything, `f` switches app, `p` switches database, `Shift+T` changes the
theme, and Ctrl+Enter saves any form.

Press `?` (or the keyboard button in the header) to see the app's full
list. The shortcuts can be changed there: click a key, then press the new
one. Your own keys are stored per browser.

## Install and run

Pick one:

| Where              | How                                        |
| ------------------ | ------------------------------------------ |
| Any OS with Docker | [Docker](#docker-any-os)                   |
| Windows, no Docker | [Windows](#windows-native-starts-at-logon) |
| Linux, no Docker   | [Linux](#linux-native-systemd)             |
| macOS, no Docker   | [macOS](#macos-native-launchd)             |
| NixOS server       | [NixOS](#nixos)                            |

The native options need **Node.js 22.9+** (https://nodejs.org), **pnpm**
(`npm install -g pnpm`, or `corepack enable`) and **Git**. Always build on
the machine that runs it: `pnpm build` bundles the SQLite binary for the
current OS, so a build from one OS won't run on another.

Once it's running, open **http://localhost:8008**.

### Docker (any OS)

Works the same on Linux, macOS (Docker Desktop / OrbStack) and Windows
(Docker Desktop).

**Build from source** (needs only Git and Docker):

```bash
git clone <repo-url> essentials
cd essentials
docker compose up -d --build        # http://localhost:8008
```

**Or use the published image** (one for every version, for `linux/amd64`
and `linux/arm64`):

```bash
docker run -d --name essentials --restart unless-stopped \
  -p 8008:8008 -v essentials-data:/data \
  ghcr.io/liteblusky/essentials:latest
```

The data lives in the `essentials-data` volume (`/data/essentials.db` inside
the container), never in the image, so rebuilding or updating keeps it.

| Task                     | Command                                                                         |
| ------------------------ | ------------------------------------------------------------------------------- |
| Update (from source)     | `git pull; docker compose up -d --build`                                        |
| Update (published image) | `docker pull ghcr.io/liteblusky/essentials:latest`, then recreate the container |
| Logs                     | `docker compose logs -f`                                                        |
| Stop / start             | `docker compose stop` / `docker compose start`                                  |
| Copy the database out    | `docker compose cp essentials:/data/essentials.db ./essentials.db`              |

To change the app name, build with
`VITE_APP_NAME="My links" docker compose up -d --build`.

The container runs in UTC unless you set your timezone: put e.g.
`TZ=Europe/Madrid` in a `.env` file next to `compose.yaml`, so the 09:00
reminders go out at your 09:00.

### Windows (native, starts at logon)

```powershell
git clone <repo-url> essentials
cd essentials
pnpm install
pnpm build
.\scripts\install-startup.ps1
```

`install-startup.ps1` registers a Scheduled Task called **Essentials** that
runs `scripts\start.ps1` each time you log on, and starts it straight away.
It runs under `conhost --headless`, so there is **no window** to close by
accident. No admin rights needed; if PowerShell refuses to run the script,
use `powershell -ExecutionPolicy Bypass -File .\scripts\install-startup.ps1`.

How it runs:

- `start.ps1` sets `PORT=8008`, kills any server a previous run left behind,
  and runs `.output\server\index.mjs` with `.env.local` loaded. If the server
  exits it restarts it after 5 seconds, so ending `node.exe` in Task Manager
  just restarts it; to really stop it, use `scripts\stop.ps1`.
- Output goes to `logs\server.log`, cleared each time the task starts.
- Don't use plain `powershell -WindowStyle Hidden` as the task action: when
  Windows Terminal is the default terminal it opens a visible window anyway,
  and closing that window kills the server.
- For other devices on the network, allow Node.js at the firewall prompt, or
  (admin PowerShell)
  `New-NetFirewallRule -DisplayName 'Essentials 8008' -Direction Inbound -Protocol TCP -LocalPort 8008 -Action Allow`.
  To keep it to this machine only, add `$env:HOST = '127.0.0.1'` next to
  `PORT` in `start.ps1`.

| Task                         | Command                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Update (after `git pull`)    | `pnpm install; .\scripts\stop.ps1; pnpm build; .\scripts\install-startup.ps1` |
| Restart the server           | `.\scripts\install-startup.ps1`                                               |
| Check it's running           | `Get-ScheduledTask Essentials` / open `logs\server.log`                       |
| Stop until next logon        | `.\scripts\stop.ps1`                                                          |
| Start again after `stop.ps1` | `Start-ScheduledTask Essentials`                                              |
| Stop and remove from startup | `.\scripts\uninstall-startup.ps1`                                             |

Stop the server before `pnpm build`: while it runs, Windows keeps the SQLite
library in `.output` locked and the build fails with `EPERM`.
`Stop-ScheduledTask` alone doesn't stop the server (it only ends the
`conhost` wrapper); use `stop.ps1`.

### Linux (native, systemd)

```bash
git clone <repo-url> ~/essentials
cd ~/essentials
pnpm install
pnpm build
```

Create `~/.config/systemd/user/essentials.service` (adjust the paths;
`which node` shows the node path):

```ini
[Unit]
Description=Essentials
After=network.target

[Service]
WorkingDirectory=%h/essentials
Environment=NODE_ENV=production PORT=8008
ExecStart=/usr/bin/node --env-file-if-exists=.env.local .output/server/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now essentials
loginctl enable-linger "$USER"   # keep it running when you're logged out
```

Update: `git pull && pnpm install && pnpm build && systemctl --user restart essentials`.
Logs: `journalctl --user -u essentials -f`.

### macOS (native, launchd)

```bash
git clone <repo-url> ~/essentials
cd ~/essentials
pnpm install
pnpm build
```

Create `~/Library/LaunchAgents/local.essentials.plist` (replace `YOU`, and
use the node path from `which node` — `/opt/homebrew/bin/node` on Apple
Silicon with Homebrew):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>local.essentials</string>
  <key>WorkingDirectory</key><string>/Users/YOU/essentials</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/node</string>
    <string>--env-file-if-exists=.env.local</string>
    <string>.output/server/index.mjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key><string>production</string>
    <key>PORT</key><string>8008</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/YOU/essentials/logs/server.log</string>
  <key>StandardErrorPath</key><string>/Users/YOU/essentials/logs/server.log</string>
</dict>
</plist>
```

```bash
mkdir -p ~/essentials/logs
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.essentials.plist
```

It starts at login and restarts if it exits. Update:
`git pull && pnpm install && pnpm build && launchctl kickstart -k gui/$(id -u)/local.essentials`.
Remove: `launchctl bootout gui/$(id -u)/local.essentials`.

### NixOS

Run the published image declaratively with `virtualisation.oci-containers`
(Podman by default). In `configuration.nix`:

```nix
{
  virtualisation.oci-containers.containers.essentials = {
    image = "ghcr.io/liteblusky/essentials:latest"; # or pin, e.g. ":1.1.0"
    ports = [ "8008:8008" ];
    volumes = [ "/var/lib/essentials:/data" ];
    # Only if the image on GHCR is private:
    # login = {
    #   registry = "ghcr.io";
    #   username = "<github-user>";
    #   passwordFile = "/run/secrets/ghcr-token"; # a PAT with read:packages
    # };
  };

  # The container runs as the image's `node` user (uid 1000).
  systemd.tmpfiles.rules = [ "d /var/lib/essentials 0750 1000 1000 -" ];

  # Reach it from other devices on the LAN.
  networking.firewall.allowedTCPPorts = [ 8008 ];
}
```

Then `sudo nixos-rebuild switch`. The data is `/var/lib/essentials/essentials.db`.

- **Update**: with a pinned tag, bump it and rebuild. With `:latest`,
  `sudo podman pull ghcr.io/liteblusky/essentials:latest && sudo systemctl restart podman-essentials`.
- **Logs**: `journalctl -u podman-essentials -f`.
- New GHCR packages start out **private**. Either make it public (GitHub →
  your profile → Packages → essentials → Package settings → Change
  visibility) or use the `login` block above.

## Updating

Each platform's update command is in its section above: pull (the source or
the image), rebuild, restart. Database changes are applied automatically
when the server starts, so an update never needs a separate database step,
and the data is kept.

## Install as an app (phone / desktop)

The app ships a web manifest and a service worker, so it can be installed
and opened like a native app. Once it has loaded, it also opens **offline**,
showing each app's data as it was last loaded (read-only: saving needs
the server).

- **Android (Chrome)**: ⋮ menu in the app → **Install app…**, or the
  browser's own menu → _Install app_ / _Add to Home screen_.
- **iPhone / iPad (Safari)**: Share → **Add to Home Screen** (the app's
  _Install app…_ item shows the same hint; iOS has no install prompt).
- **Desktop Chrome / Edge**: ⋮ menu → **Install app…**, or the install icon
  in the address bar.

Browsers only allow installing (and the offline service worker) on a
**secure origin**: `https://…` or `http://localhost`. Opening
`http://192.168.x.x:8008` from your phone works as a normal page but won't
install or work offline. To install it on a phone, put it behind HTTPS, for
example with Tailscale (`tailscale serve --bg 8008`, then open the
`https://<machine>.<tailnet>.ts.net` address it prints) or a reverse proxy
with a certificate (Caddy, nginx…).

## Configuration

Nothing is required. The assistant, phone reminders and remote databases
are set up in the app: ⋮ menu → **Settings…** (saved in the database, no
restart needed).

Environment variables are only a fallback for anything not saved there,
plus two things Settings doesn't cover. They go in `.env.local` in the
project folder for the native options, or in a `.env` next to
`compose.yaml` (or your shell) for Docker; `.env.example` lists them all.

| Variable                                                   | What                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_PATH`                                            | Where the SQLite file lives (default `data/essentials.db`; Docker: `/data/essentials.db`) |
| `VITE_APP_NAME`                                            | The name shown in the app (default "Essentials"). Build-time: rebuild after changing it   |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | The assistant (fallback for Settings)                                                     |
| `NTFY_TOPIC`, `NTFY_URL`, `NTFY_TOKEN`, `PUBLIC_URL`       | Phone reminders (fallback for Settings)                                                   |
| `TZ`                                                       | Docker only: your timezone, e.g. `Europe/Madrid` (default UTC)                            |

Don't put `PORT` in `.env.local`: the port (8008) is set by the start
script / service / image.

There's no login, so anyone on your network can change the settings, but
the API key, ntfy token and database tokens are never shown back (only
their last 4 characters).

### Assistant (Jarvis)

Optional and off by default. It needs an LLM key, set in Settings:

- **OpenRouter** (the default provider): a key from
  [openrouter.ai](https://openrouter.ai) reaches Claude, GPT, Gemini and
  more (change the model). Any other OpenAI-compatible API works too:
  change the base URL and model.
- **Anthropic**: pick "Anthropic" as the provider and paste a key from
  [console.anthropic.com](https://console.anthropic.com). The model
  defaults to `claude-opus-5-5`; `claude-haiku-5-5` is much cheaper.

Without a key the field isn't shown and nothing is sent anywhere.

**Ask Jarvis**: a field on every app (press `s` or tap it; on a wide
screen it's a chat panel on the right). Type something like _"remind me to
call the dentist Friday at 3"_ or _"note: cabin wifi is abc123"_, press
Enter, and it's created and filed: into the folder you name, else an
existing folder that fits (a dentist appointment into "Health"), else a new
folder when the topic clearly deserves one, and only into **Unsorted** when
nothing fits. A list (_"shopping list: milk, eggs, bread"_) becomes one
note with a checklist. It also finds things: _"open my packing list"_,
_"find the dentist task"_ or _"go to the GitHub link"_ opens the best
match (links in a new tab). It can edit and delete too, and add contacts,
calendar strips and money (_"Jarvis, spent 12 on lunch"_).

You can dictate instead of typing: the mic button in the field (Chrome,
Edge, Safari; it needs https or localhost), or the phone keyboard's own
mic. The globe next to it lets that one request search the web. Typing `@`
in any text field links to another item (a bookmark, note, task or
contact).

**Chat** (the last app in the navbar): ask about anything you've saved:
_"what's due this week?"_, _"what did I write about the CRM?"_, _"which
links do I have about invoices?"_. It looks things up before answering,
and can add, open, **edit and delete** things when you ask (_"rename the
dentist task to…"_, _"translate all my open tasks to Spanish"_, _"delete
the old Incidencias folder"_). Conversations are saved for a week after
their last message; delete them from the list. Every answer can be saved
as a note.

Everything you ask Jarvis in the field is saved as a chat too, so you can
read the answer again or carry on from it in Chat.

**Undo**: every reply that changed something has an Undo button that puts
it all back, deletes included: in Chat, on the field's toast, and on every
request in ⋮ → **Assistant history…**.

With more than one database (Settings → Database), Jarvis knows your
profiles: if something isn't in the one you're using it looks in the
others and tells you where it is, and it can copy or move things between
them (_"copy the dentist task from Work to here"_). Undo covers every
profile.

Only what you type and the items it looks up to answer are sent to the
provider. ⋮ menu → **Assistant history…** lists every request with its
result, tokens and cost (reported by OpenRouter, or worked out from
Anthropic's prices).

**In Finances** the AI is only used when you ask: the ✨ Auto-categorize
toggle when adding money, ⋮ → Categorize, or **Advice** (a plain-language
recap and tips, also saved as a chat).

### Phone reminders

Optional. The server pushes reminders to your phone through
[ntfy](https://ntfy.sh):

1. Install the ntfy app (Android: Play Store / F-Droid; iPhone: App Store).
2. Pick a long random topic name and subscribe to it in the app (on
   ntfy.sh anyone who knows the topic name can read it).
3. Enter it in Settings → ntfy topic (plus the server and token if you run
   your own ntfy), and optionally the app address so tapping a reminder
   opens the app. Save.
4. Settings → **Send test reminder**.

What's pushed:

- **Tasks** with a due date. Each task picks when it reminds you (the
  **Remind** field, under Due): at the due time (the default), 5 / 15 / 30
  minutes, 1 / 2 hours or a day before, or not at all. It's pushed then,
  again when it falls due, and every 10 minutes after that until the task
  is completed (changing the due date or the reminder re-arms it).
- **Calendar strips**, the day before they start, at 09:00.
- **Birthdays** of your contacts, on the day, at 09:00.
- **Finances**: a recurring charge on the day it's due (at 09:00), and a
  budget when it's nearly used up (80%) and when it's over.

The 09:00 ones use the server's timezone (in Docker set `TZ`, see
[Docker](#docker-any-os)). The server checks every minute, so it must be
running. Every database is reminded (Local and each one in Settings →
Database, whether in use or not), and the reminder says which database
it's from. Works over plain http on the LAN: the push goes server → ntfy →
phone.

### Remote database

Optional. Settings… → Database can keep the data in
[Turso](https://turso.tech) (hosted libSQL; the free tier is plenty)
instead of the local file, and switch between several Turso databases (e.g.
work / personal) or back to local at any time. Create one with
`turso db create personal`, then paste `turso db show personal --url` and a
token from `turso db tokens create personal` into **Add Turso database**.
Its tables are created when it's added.

Each database has its own data; switching copies nothing. Switch with the
user icon in the header, or `p`. To bring data over, switch to the database
you want to fill, then press **Copy** on the other one in Settings →
Database: it replaces everything in the current database with a copy of
that one. Settings themselves always stay in the local file. The footer
shows which database is in use.

## Finances in short

Press **Add** (or `a`), type the amount (− for money out, + for money in),
optionally what it was, a category and a currency (euros by default), and
save. Each month shows what came in, went out and is left, with a circle
chart of where it went; what a month leaves carries over into the next.

- **Recurring** expenses and income (rent, a subscription, a salary) are
  never added on their own: each one waits in **To accept** on its day for
  you to accept or skip.
- **Budgets** per category are optional.
- **Savings** accounts keep money apart, with an optional goal; putting
  money in comes off what's left this month.
- Once a new month starts, a banner offers to **close** the last one: its
  entries are then deleted and only the totals per category are kept.

## Data: backup and moving machines

- **Backup**: ⋮ menu → **Export JSON** in Bookmarks, Notes, Tasks and
  Contacts (works everywhere, while running), or copy `essentials.db`
  (everything) while the server is stopped. Docker:
  `docker compose cp essentials:/data/essentials.db ./essentials.db`.
- **Restore / move**: ⋮ menu → **Import JSON** on the new instance (adds to
  what's there), or put `essentials.db` in place before its first start
  (Docker: the `/data` volume; NixOS: `/var/lib/essentials/`, owned by uid
  1000).

**Coming from the separate Bookmarks and Notes apps?** Build one combined
database from the two old files (they're only read, never changed):

```bash
node scripts/merge-dbs.mjs data/bookmarks.db ../notes/data/notes.db data/essentials.db
```

Or keep it manual: Export JSON from the old Notes app and Import JSON in
Notes here (view counts aren't exported).

## Development

Working on the code (the stack, the dev server, migrations, releasing a
version) is covered in [`DEVELOPMENT.md`](./DEVELOPMENT.md).
