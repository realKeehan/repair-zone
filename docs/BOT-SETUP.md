# Running & moving the Discord bot

Everything needed to stand the bot up on a fresh server, plus the gotchas that
cost us time on cPanel. Keep this next to [DEPLOYMENT.md](./DEPLOYMENT.md).

## How the bot fits into the app

The bot runs **inside the same Node process as the website** and shares an
**in-process data store** (`data/db.json`) with the web API — a website repair
request and a Discord modal both write to the same place, which is how a form
submission can turn into a forum post. So you don't run the bot as a separate
service; **you move the whole app together.** (Running the bot alone on another
host would give it its own `db.json` and desync the queue.)

What the bot fundamentally needs: the code, `npm install`, the right env vars, and
an **always-on process** holding a WebSocket to Discord.

## Requirements checklist

- **Node ≥ 18** (20/22 fine).
- **discord.js ≥ 14.27** — the request modal uses the newer Label/FileUpload
  builders; older versions crash the bot. Verify: `npm ls discord.js`.
- **Env vars** (see the table in [DEPLOYMENT.md](./DEPLOYMENT.md#3-environment-variables)):
  `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`,
  `DISCORD_FORUM_CHANNEL_ID`, plus optional `DISCORD_LOG_CHANNEL_ID` /
  `DISCORD_WEBHOOK_URL`. (The bot only boots when both `DISCORD_BOT_TOKEN` and
  `DISCORD_CLIENT_ID` are set.)
- **Bot invited** to your server with scopes **`bot` + `applications.commands`**, and
  these channel permissions on the forum: *View Channel, Send Messages, Create
  Posts, Send Messages in Threads, Embed Links, Attach Files, Add Reactions*
  (needed for the status hearts), *Manage Threads* (pin/lock/archive the panel &
  tickets), and optionally *Manage Channels* (lets it auto-create the forum tags).
- **No privileged intents** — the bot uses only the `Guilds` intent, so you do **not**
  need to toggle any privileged gateway intents in the Developer Portal.
- **An always-on runtime** — a process that stays alive, not one spun up per web
  request.

## First-time setup on any host

1. Get the code and install deps: `npm install`.
2. Provide the env vars — a `.env` file in the app root, **or** the host's env-var UI.
3. Register slash commands **once**: `npm run deploy-commands` (guild-scoped =
   instant). Re-run this only when you change the commands themselves.
4. Start it and keep it running: `npm start` under a process manager
   (pm2 / systemd / the host's "always on" mode).
5. In Discord, post the panel: **`/panel`** (creates the pinned "Request a Repair"
   forum post).

## The bot token (and "Authentication failed")

Developer Portal → your app → **Bot** → **Reset Token** → **Copy**. Paste it **raw**:
no quotes, no `Bot ` prefix, no leading/trailing space or newline, and make sure
it's the **Bot token** — not the Client Secret or Public Key.

- `[discord] Bot failed to start … Authentication failed` (gateway code 4004) means
  the token is **invalid/stale** — almost always because it was reset in the portal
  *after* you saved it. Reset it, repaste, restart.
- **Only one process may run per token at a time.** Two instances (e.g. an old
  server still running) fight over the connection.
- The first segment of a token is the app's user ID in base64 — if it decodes to a
  different ID than `DISCORD_CLIENT_ID`, you pasted a token from the wrong app.

## cPanel / Passenger specifics (what tripped us up)

This host is request-driven, which causes a few surprises:

- **`node: command not found`** → activate the app's virtualenv first:
  `source ~/nodevenv/<app-root>/<ver>/bin/activate` (the exact line is on the
  *Setup Node.js App* screen). It only lasts for that shell session.
- **Env vars set in the cPanel UI are injected by Passenger only.** A manual
  `node app.js` in the shell won't see them and will falsely log "Discord bot is
  disabled." To see the *real* run's output, read **`stderr.log`** in the app root.
- **"Restart" doesn't start the process until a request arrives.** After restarting,
  hit the site (e.g. `curl -s https://YOURDOMAIN/healthz`) to actually spawn it.
- **Passenger idles the app with no traffic**, which drops the bot offline. Keep it
  warm with a cron (every 5 min):
  ```
  */5 * * * * curl -s https://YOURDOMAIN/healthz >/dev/null 2>&1
  ```
- **To read a clean boot log** (the log accumulates old lines):
  ```
  : > stderr.log     # empty it
  # …click Restart in cPanel…
  curl -s https://YOURDOMAIN/healthz >/dev/null
  tail -n 40 stderr.log
  ```

## Moving to a new server — migration checklist

1. **Stand up the new host:** code, `npm install`, and copy **all** env vars
   (`DISCORD_*`, `ADMIN_TOKEN`, `PUBLIC_BASE_URL`, `TRUST_PROXY`).
2. **Copy `data/db.json`** from the old server to preserve the live queue, rentals,
   and the Discord thread links. ⚠️ It contains attendee PII — move it securely and
   never commit it.
3. **Slash commands:** no need to re-run `deploy-commands` if it's the same bot app
   and same guild — registration lives on Discord's side, not the host. Re-run only
   if you change the app or the guild id.
4. **Stop the old instance so two bots don't fight over the token:** stop the old
   cPanel app **and delete its keep-alive cron** — otherwise the cron keeps
   resurrecting the old bot.
5. **Point DNS at the new host**, update `PUBLIC_BASE_URL`, and update the keep-alive
   cron URL if the domain changed.
6. **Admin auth:** if the new host isn't Apache, `.htaccess` Basic Auth won't apply —
   use `ADMIN_TOKEN` (or Cloudflare Access) instead of `ADMIN_AUTH=external`.
7. **Start the new one and verify** (below).

## Verify it's working

- Bot shows **Online** in the member list (with *"Watching repair requests 🔧"*).
- `/queue` or `/tools` responds.
- Submitting a repair request creates a forum post; changing its status posts a
  `Status → …` line and updates the ticket's **heart reaction**
  (see [TICKET-CLAIMING.md](./TICKET-CLAIMING.md)).

## Recommended host for an always-on bot

Any host that keeps a process alive: a small **VPS** (~$5), **Railway**, **Render**
(as a Web Service so `/healthz` keeps it awake), **Fly.io**, or even a **Raspberry Pi**
during the event. Because the site and bot are one process, running everything on a
single always-on box is the simplest setup and keeps them perfectly in sync.
