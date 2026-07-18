# 🔧 The Repair Zone

Website **+ Discord bot** for **The Repair Zone** — the volunteer booth that does **free repairs and tool rentals** at [Open Sauce](https://opensauce.com/).

Attendees submit repair requests from the website or straight from Discord (a button opens a form → the bot spins up a forum thread, pings them, and asks for photos). Volunteers work the queue and track tool lending from two admin panels.

---

## ✨ Features

**For attendees (public site)**
- 🏠 Landing page explaining the booth, services, and how it works
- 📝 **Repair request form** — no need to wait in line at the booth
- 🧰 **Borrow-a-tool page** with a **live, auto-filled inventory list** showing each tool's real-time status (available / out / maintenance); unavailable tools are disabled so you can't double-book
- 📜 Full **Terms & Conditions** (repairs + tool rentals), mirrored from the printed forms

**On Discord**
- 🔘 A persistent **"Request a Repair" button** you drop into any channel (`/panel`)
- 🪟 The button opens a **modal form** (name, phone, item, problem, extra info)
- 🧵 On submit, the bot **creates a new forum post** in your forum channel, **pings the requester**, and asks them to drop **photos/files** in the thread
- 🛠️ Volunteer slash commands: `/queue`, `/claim`, `/status`, `/tools`
- 🔔 Optional staff log channel/webhook for every new request and tool checkout

**For volunteers (admin panels, token-protected)**
- 📊 **Repair status panel** — live queue with stats, filters, search, one-click status changes, claim/assign, and internal notes. Status changes made here also post back into the Discord thread.
- 🧰 **Borrowing & inventory panel** — check tools in/out, see who has what and since when, manage the inventory, and browse the full rental log

Everything is **framework-free** (vanilla HTML/CSS/JS front-end, Express back-end) and stores data in a **single JSON file** — no database server to babysit at a convention. The website runs fine **with or without** the Discord bot.

---

## 🧱 Tech stack

- **Node.js + Express** — web server & JSON API
- **discord.js v14** — bot, buttons, modals, forum threads, slash commands
- **helmet + express-rate-limit** — basic hardening for a public endpoint
- **Vanilla front-end** — no build step, no framework, light/dark aware
- **JSON file store** (`data/db.json`) — zero-config persistence

---

## 🚀 Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure
cp .env.example .env
#   → set ADMIN_TOKEN (required for the admin panels)
#   → Discord vars are optional; leave blank to run website-only

# 3. Run
npm start
```

Then open:

| Page | URL |
| --- | --- |
| Public site | http://localhost:3000 |
| Repair request | http://localhost:3000/repair |
| Borrow a tool | http://localhost:3000/borrow |
| Repair admin | http://localhost:3000/admin |
| Borrowing admin | http://localhost:3000/admin/borrowing |

Sign into the admin panels with the `ADMIN_TOKEN` you set in `.env`.

> `npm run dev` runs with `--watch` for auto-reload during development.

---

## 🤖 Discord bot setup

The bot is optional. To enable it:

1. **Create the application & bot**
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
   - Open **Bot** → **Reset Token** and copy it into `DISCORD_BOT_TOKEN`.
   - Copy the **Application ID** (General Information) into `DISCORD_CLIENT_ID`.
   - No privileged intents are required — the bot only uses the default `Guilds` intent.

2. **Invite the bot** to your server with an OAuth2 URL (Developer Portal → **OAuth2 → URL Generator**):
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: **View Channels**, **Send Messages**, **Create Public Threads**, **Send Messages in Threads**, **Embed Links**

3. **Get your IDs** (enable Developer Mode in Discord: User Settings → Advanced → Developer Mode):
   - Right-click your server → **Copy Server ID** → `DISCORD_GUILD_ID`
   - Create a **Forum channel** for repair tickets, right-click it → **Copy Channel ID** → `DISCORD_FORUM_CHANNEL_ID`
   - (Optional) A text channel or webhook for staff logs → `DISCORD_LOG_CHANNEL_ID` or `DISCORD_WEBHOOK_URL`

4. **Register the slash commands** (run once, and again whenever commands change):
   ```bash
   npm run deploy-commands
   ```

5. **Start the app** (`npm start`) — the bot logs in alongside the web server.

6. **Post the request panel:** in the channel where attendees should start, run `/panel`. This posts the embed with the **Request a Repair** button. The button is persistent, so it keeps working across restarts.

### The Discord flow

```
[Request a Repair] button
        │  (attendee taps)
        ▼
   Modal form (name · phone · item · problem · info)
        │  (submit)
        ▼
   New FORUM POST created ──► pings the attendee
                          └─► "reply with photos/files here"
        │
        ▼
   Also saved to the queue → visible in the web admin panel
```

> **Why photos aren't in the form:** Discord modals only support text fields — they can't accept file uploads. So the bot creates the thread first, pings the requester, and invites them to drop photos/files directly in the thread (which works great and keeps everything in one place).

### Volunteer slash commands

| Command | What it does |
| --- | --- |
| `/panel` | Post the "Request a Repair" button panel in the current channel |
| `/queue` | List the open repair queue |
| `/claim id:<#>` | Claim a request so others know you've got it |
| `/status id:<#> to:<status>` | Update a request's status (also posts to its thread) |
| `/tools` | Show tool inventory & availability |

---

## ⚙️ Configuration

All configuration lives in `.env` (see `.env.example`):

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | – | Web server port (default `3000`) |
| `PUBLIC_BASE_URL` | – | Public URL of the site (used in links) |
| `ADMIN_TOKEN` | ✅ | Secret token that protects the admin panels & API |
| `DISCORD_BOT_TOKEN` | for bot | Bot token |
| `DISCORD_CLIENT_ID` | for bot | Application (client) ID |
| `DISCORD_GUILD_ID` | for bot | Server ID (for instant slash-command registration) |
| `DISCORD_FORUM_CHANNEL_ID` | for forum posts | Forum channel where repair threads are created |
| `DISCORD_LOG_CHANNEL_ID` | – | Optional staff log channel |
| `DISCORD_WEBHOOK_URL` | – | Optional webhook alternative for logs |

---

## 🗂️ Project structure

```
repair-zone/
├── src/
│   ├── server.js              # Express entry — serves site, mounts API, boots bot
│   ├── config.js              # env config + validation
│   ├── db.js                  # JSON store: repairs, tools, rentals
│   ├── routes/
│   │   └── api.js             # public + admin JSON API
│   └── discord/
│       ├── bot.js             # button panel, modal, forum threads, slash handlers
│       ├── commands.js        # slash command definitions
│       ├── deploy-commands.js # one-time command registration
│       └── notify.js          # bridge: web ⇄ Discord (threads, logs, updates)
├── public/                    # static front-end (no build step)
│   ├── index.html  repair.html  borrow.html  terms.html
│   ├── admin/index.html       # repair status panel
│   ├── admin/borrowing.html   # borrowing & inventory panel
│   ├── css/styles.css
│   └── js/*.js
├── data/                      # db.json lives here at runtime (gitignored)
├── docs/                      # original printed T&C / rental agreements (PDF)
└── .env.example
```

---

## 🌐 Deployment notes

- Runs anywhere Node 18+ runs (Render, Railway, Fly.io, a Raspberry Pi at the booth, etc.).
- Set the environment variables in your host's dashboard; **never commit `.env`**.
- `data/db.json` is the live queue + inventory — put it on a persistent volume so it survives restarts. It is intentionally **git-ignored**.
- Behind a reverse proxy, forward `Host`/`X-Forwarded-*` headers so rate-limiting sees real client IPs.

## 🔐 Privacy & data

Requests contain personal contact info (names, phone numbers). Keep `ADMIN_TOKEN` secret, serve the site over HTTPS in production, and clear out `data/db.json` after the event. The public tool endpoint never exposes borrower details — only tool names and status.

## 📄 License

MIT — see [LICENSE](LICENSE). Built for the Open Sauce Repair Zone volunteers. Questions about the actual booth/terms go to Nathan Wortman or Evan Brand.
