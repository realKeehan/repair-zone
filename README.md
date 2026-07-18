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
- 🔘 A persistent **"Request a Repair" button**, posted as a **pinned forum post** in your forum channel (`/panel`)
- 🪟 The button opens a **modal form** with a **request-type picker** (Repair, 3D Print, Electronics, Other), a description, **phone number**, **booth ID**, and a **photo upload** (up to 5 files — Discord modals support file uploads via the new Label/Components-v2 API)
- 🧵 On submit, the bot **creates a new forum post**, **applies the matching tag** (e.g. `3D Print`), **pings the requester**, and **attaches their photos**
- 🏷️ Auto-provisions the request-type **forum tags** on startup so posts are filterable
- 🛠️ Volunteer slash commands: `/queue`, `/claim`, `/status`, `/tools`
- 🔔 Optional staff log channel/webhook for every new request and tool checkout

**For volunteers (admin panels, token-protected)**
- 📊 **Overview sheet** — a spreadsheet-style full view with **Requests / Rentals / Inventory tabs**, filtering, and **CSV export** per tab
- 🔧 **Repair status panel** — live queue with stats, filters, search, one-click status changes, claim/assign, and internal notes. Status changes made here also post back into the Discord thread.
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
| Overview sheet | http://localhost:3000/admin/sheet |
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

6. **Post the request panel:** run `/panel`. It creates a **pinned forum post** titled "📌 Request a Repair — start here" in your forum channel, containing the **Request a Repair** button. The button is persistent, so it keeps working across restarts.

### The Discord flow

```
[Request a Repair] button (pinned forum post)
        │  (attendee taps)
        ▼
   Modal form:
     • What do you need?  (Repair / 3D Print / Electronics / Other)
     • Describe the request
     • Phone number
     • Booth ID / location
     • Photos (up to 5 file uploads)
        │  (submit)
        ▼
   New FORUM POST created ──► tagged by type (e.g. "3D Print")
                          ├─► pings the attendee
                          └─► attaches their uploaded photos
        │
        ▼
   Also saved to the queue → visible in the web admin panels
```

> **Photos in the modal:** Discord's newer modal API (Components v2 / Label components) supports **file upload** inputs, so photos are collected right in the form (up to 5). If an upload ever fails to re-attach, the bot still creates the post and asks the requester to drop the files in the thread. Requires **discord.js ≥ 14.27** (this project pins a compatible version).

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
| `TRUST_PROXY` | – | Reverse-proxy hops to trust (default `1`; keep `1` behind Cloudflare/cPanel) |
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
├── app.js                     # cPanel/Passenger entry point (boots src/server.js)
├── public/                    # static front-end (no build step)
│   ├── index.html  repair.html  borrow.html  terms.html
│   ├── admin/sheet.html       # overview spreadsheet (Requests/Rentals/Inventory tabs)
│   ├── admin/index.html       # repair status panel
│   ├── admin/borrowing.html   # borrowing & inventory panel
│   ├── css/styles.css
│   └── js/*.js
├── data/                      # db.json lives here at runtime (gitignored)
├── docs/
│   ├── DEPLOYMENT.md          # Namecheap cPanel + Cloudflare guide
│   └── *.pdf                  # original printed T&C / rental agreements
└── .env.example
```

---

## 🌐 Deployment

- **Namecheap (cPanel) + Cloudflare:** step-by-step guide in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. The site runs on cPanel's *Setup Node.js App* (Passenger) with `app.js` as the startup file; Cloudflare fronts DNS/HTTPS. `TRUST_PROXY=1` makes rate-limiting see real client IPs behind the proxy.
- **Any Node 18+ host** (Render, Railway, Fly.io, a VPS, a Raspberry Pi at the booth) works too — set the env vars in the dashboard and run `npm start`.
- **Discord bot:** it needs an always-on process. Shared cPanel hosting can idle it out, so for the bot prefer an always-on host (Railway/Render/VPS). See the note at the end of the deployment guide. The website is happy on cPanel regardless.
- `data/db.json` (live queue + inventory) is **git-ignored** — keep it on a persistent volume so it survives restarts.

## ⚖️ A note on signatures & waivers

The website's "I agree to the Terms" checkbox is an **acknowledgment**, not the binding waiver. Because attendees aren't identity-verified online and the group is an unincorporated volunteer association handling potential injury/property liability, the **binding liability waiver is still signed on paper at the booth** — that's the stronger, more defensible record (especially under California law). The forms make this explicit ("you'll sign the waiver at the booth"). The site records the acknowledgment + timestamp as intake. *This isn't legal advice; if the group wants online e-signatures to be binding, run it past a lawyer first.*

## 🔐 Privacy & data

Requests contain personal contact info (names, phone numbers, photos). Keep `ADMIN_TOKEN` secret, serve the site over HTTPS in production, and clear out `data/db.json` after the event. The public tool endpoint never exposes borrower details — only tool names and status.

## 📄 License

MIT — see [LICENSE](LICENSE). Built for the Open Sauce Repair Zone volunteers. Questions about the actual booth/terms go to Nathan Wortman or Evan Brand.
