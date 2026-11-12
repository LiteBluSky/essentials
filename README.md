# Essentials

A handful of small personal apps in one: **Bookmarks** (links), **Notes**
(markdown), **Tasks** (a to-do list with due dates and phone reminders), a
**Calendar** (coloured strips over days or date ranges, with the tasks due) and
**Contacts** (people: phone, email, address, where you know them from); all but the Calendar are organised into folders and subfolders and shown as a file
tree. Optionally, a **"Tell me…"** field on every app turns a typed or
dictated sentence into a task or note, and a **Chat** app answers questions
about everything you've saved. Switch between them with the navbar at the top, or `Shift+H` /
`Shift+L`. No accounts, no sync. It runs on your own machine or home server
and serves on **http://localhost:8008**.

Stack: TanStack Start (React 19) on Nitro/Node, SQLite via Drizzle, shadcn/ui
and Tailwind. See [`CLAUDE.md`](./CLAUDE.md) for architecture and
conventions and [`TASKS.md`](./TASKS.md) for the work log.

There's nothing to configure and no database server: the data is one SQLite
file, created with its tables the first time the server starts. Optional
settings (see `.env.example`): `DATABASE_PATH` (where the file lives,
default `data/essentials.db`) and `VITE_APP_NAME` (the name shown in the app;
build-time). The assistant and phone reminders are off until you set them
up (see [Assistant and reminders](#assistant-and-reminders)).

> **No login.** The server listens on all interfaces, so anyone who can reach
> port 8008 can read and edit your bookmarks, notes and tasks. Keep it on your LAN (or behind
> something like Tailscale); don't forward the port to the internet.

## Deploy

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

### Docker (any OS)

Works the same on Linux, macOS (Docker Desktop / OrbStack) and Windows
(Docker Desktop).

**Build from source** (needs only Git and Docker):

```bash
git clone <repo-url> essentials
cd essentials
docker compose up -d --build        # http://localhost:8008
```

**Or use the published image** (built by GitHub Actions for every version
tag, for `linux/amd64` and `linux/arm64`):

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

| Task                              | Command                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------- |
| Deploy changes (after `git pull`) | `pnpm install; .\scripts\stop.ps1; pnpm build; .\scripts\install-startup.ps1` |
| Restart the server                | `.\scripts\install-startup.ps1`                                               |
| Check it's running                | `Get-ScheduledTask Essentials` / open `logs\server.log`                       |
| Stop until next logon             | `.\scripts\stop.ps1`                                                          |
| Start again after `stop.ps1`      | `Start-ScheduledTask Essentials`                                              |
| Stop and remove from startup      | `.\scripts\uninstall-startup.ps1`                                             |

Stop the server before `pnpm build`: while it runs, Windows keeps the SQLite
library in `.output` locked and the build fails with `EPERM`.
`Stop-ScheduledTask` alone doesn't stop the server (it only ends the
`conhost` wrapper); use `stop.ps1`.

If you use Claude Code here, link its copy of the shadcn skill (a junction
holds an absolute path, so it isn't committed):

```powershell
New-Item -ItemType Directory -Force .claude\skills | Out-Null
New-Item -ItemType Junction -Path .claude\skills\shadcn -Target (Resolve-Path .agents\skills\shadcn).Path
```

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

## Assistant and reminders

Both are optional and off by default. Set them up in the app: ⋮ menu →
**Settings…** (saved in the database, no restart needed). Environment
variables of the same names (`.env.local`, or a `.env` next to
`compose.yaml` for Docker) still work as a fallback.

**"Tell me…"** — a field at the top of every app (press `s` or tap it).
Type (or tap the phone keyboard's mic and talk) something like
_"remind me to call the dentist Friday at 3"_ or _"note: cabin wifi is
abc123"_, press Enter, and it's created and filed: into the folder you
name, else an existing folder that fits (a dentist appointment into
"Health"), else a new folder when the topic clearly deserves one, and only
into **Unsorted** when nothing fits. A list (_"shopping list: milk, eggs, bread"_)
becomes one note with a checklist. It also finds things: _"open my packing
list"_, _"find the dentist task"_ or _"go to the GitHub link"_ opens the
best match (links in a new tab). It needs an LLM key, set in Settings:

- **OpenRouter** (the default provider): a key from
  [openrouter.ai](https://openrouter.ai) reaches Claude, GPT, Gemini and
  more (change the model). Any other OpenAI-compatible API works too:
  change the base URL and model.
- **Anthropic**: pick "Anthropic" as the provider and paste a key from
  [console.anthropic.com](https://console.anthropic.com). The model
  defaults to `claude-opus-5-5`; `claude-haiku-5-5` is much cheaper.

**Chat** (the fourth app in the navbar) — ask about anything you've saved:
_"what's due this week?"_, _"what did I write about the CRM?"_, _"which
links do I have about invoices?"_. It looks things up in your bookmarks,
notes and tasks before answering, and can add, open, **edit and delete**
things when you ask (_"rename the dentist task to…"_, _"translate all my
open tasks to Spanish"_, _"delete the old Incidencias folder"_). Every reply
that changed something has an **Undo** button that puts it all back,
deletes included. Conversations are saved; delete them from the list.

The **Tell me** field can edit and delete too (its toast offers Undo), and
⋮ → Assistant history has an Undo on every request that changed
something.

Only what you type (and, in Chat, the items it looks up to answer) is sent
to the provider. ⋮ menu → **Assistant history…** lists every request with its result, tokens and cost
(reported by OpenRouter, or worked out from Anthropic's prices).

**Phone reminders** — when a task with a due date falls due, the server
pushes it to your phone through [ntfy](https://ntfy.sh):

1. Install the ntfy app (Android: Play Store / F-Droid; iPhone: App Store).
2. Pick a long random topic name and subscribe to it in the app.
3. Enter it in Settings → ntfy topic (plus the server and token if you run
   your own ntfy), and optionally the app address so tapping a reminder
   opens the app. Save.
4. Settings → **Send test reminder**.

Each task picks when it reminds you (the **Remind** field, under Due): at
the due time (the default), 5 / 15 / 30 minutes, 1 / 2 hours or a day
before, or not at all. It's pushed then, again when it falls due, and
every 10 minutes after that until the task is completed (changing the due
date or the reminder re-arms it); the server checks every minute, so it must be
running. Works over plain http on the
LAN: the push goes server → ntfy → phone.

There's no login, so anyone on your network can change these settings,
but the API key and ntfy token are never shown back (only their last 4
characters).

## Data: backup and moving machines

- **Backup**: ⋮ menu → **Export JSON** in each app (works everywhere, while
  running), or copy `essentials.db` (everything) while the server is stopped.
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
the Notes tab here (view counts aren't exported).

Schema changes are applied automatically when the server starts, so an
update never needs a separate database step.

## Development

```bash
pnpm dev          # http://localhost:3000, hot reload (separate from the 8008 instance)
pnpm typecheck
pnpm lint
pnpm format
pnpm db:studio    # browse the data
pnpm db:generate  # after editing src/db/schema.ts: write a migration (commit it)
```

After any nontrivial change: `pnpm typecheck && pnpm lint && pnpm build`.

### Releasing a version

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
