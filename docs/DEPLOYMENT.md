# Deploying to Namecheap (cPanel) + Cloudflare

This app is a **Node.js server**, not a static site — the forms, admin panels, and API all need Node running. Namecheap shared hosting can run it via cPanel's **Setup Node.js App** (Phusion Passenger). Cloudflare sits in front for DNS, HTTPS, and caching.

> ⚠️ **Read the "Discord bot" note at the bottom first.** The website runs great on cPanel shared hosting. A long-running Discord *bot* is a poor fit for shared hosting and is usually better hosted separately. You can absolutely run the website on cPanel and the bot elsewhere — they share nothing but the (optional) same data file.

---

## 1. Upload the code

Option A — **Git** (if your cPanel has "Git Version Control"):
- Clone `https://github.com/realKeehan/repair-zone` into a folder like `~/repair-zone` (outside `public_html`).

Option B — **Zip upload**:
- Download the repo as a ZIP, upload via cPanel **File Manager**, and extract into `~/repair-zone`.
- Do **not** upload `node_modules` — cPanel installs dependencies for you.

## 2. Create the Node.js application

cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
| --- | --- |
| Node.js version | 18+ (20 or 22 recommended) |
| Application mode | Production |
| Application root | `repair-zone` (the folder you uploaded) |
| Application URL | your domain or subdomain (e.g. `repairs.yourdomain.com`) |
| Application startup file | `app.js` |

Click **Create**. cPanel gives you a command to enter the app's virtualenv — you'll use it or the UI buttons below.

## 3. Environment variables

In the Node.js App screen, add the environment variables from `.env.example`:

- `ADMIN_TOKEN` — **required**, a long random string
- `TRUST_PROXY` — `1`
- `PUBLIC_BASE_URL` — `https://repairs.yourdomain.com`
- Discord vars only if you're also running the bot here (see the note below)

Do **not** upload a `.env` file with secrets; use the cPanel env-var UI. (The app reads real environment variables too, not just `.env`.)

## 4. Install dependencies & start

- Click **Run NPM Install** (or, in the virtualenv shell: `npm install`).
- If you enabled the bot and changed commands, run once: `npm run deploy-commands`.
- Click **Restart**. Passenger keeps the site running and restarts it on requests.

Passenger sets `PORT` (actually a socket) for you; `src/server.js` already listens on `process.env.PORT`.

## 5. Cloudflare

1. Point your domain's nameservers to Cloudflare (or add the DNS record if Cloudflare already manages the domain).
2. Add an **A/CNAME record** for the subdomain pointing to your Namecheap server IP, **proxied** (orange cloud).
3. SSL/TLS mode: **Full** (or **Full (strict)** once AutoSSL has issued a cert on cPanel).
4. Because Cloudflare proxies requests, the app relies on `TRUST_PROXY=1` (already set) to read the real visitor IP for rate-limiting.
5. Optional caching: create a cache rule to **bypass cache** for `/api/*` and `/admin*` so the queue is always live. Static assets (`/css`, `/js`) cache fine.

## 6. Persist the data file

The live queue + inventory live in `data/db.json`. On cPanel this persists in your app folder between restarts — just don't delete it. Back it up occasionally during the event, and clear it (it contains attendee contact info) after the show.

---

## 🤖 About the Discord bot on shared hosting

The bot needs a **persistent outbound WebSocket** to Discord and must stay running 24/7. Phusion Passenger on shared cPanel is request-driven — it may idle your process out when the website gets no traffic, which drops the bot connection. It also complicates having a single always-on process.

**Recommended split:**
- **Website + admin panels → cPanel** (what this guide sets up). Leave the Discord vars blank there.
- **Discord bot → a small always-on host** — a free/cheap tier on Railway, Render (Background Worker), Fly.io, a $5 VPS, or a Raspberry Pi at the booth. Run the same repo there with the Discord vars set.

If you run the bot separately from the website, point both at the **same data store** (e.g. a shared volume, or later swap `src/db.js` for a hosted database) so the admin panels and the bot see the same requests. Out of the box they each keep their own `data/db.json`; for a single unified queue, run the **whole app in one place** (a VPS/Railway/Render service) instead of splitting it — that's the simplest path if you want the bot and the website fully in sync.

**Simplest overall:** run the entire app (website + bot) on one always-on Node host (Railway/Render/VPS) and just point Cloudflare DNS at it. Use cPanel only if you specifically want the site on your existing Namecheap hosting.
