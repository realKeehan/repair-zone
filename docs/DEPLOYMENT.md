# Deploying to Namecheap (Stellar / cPanel) + Cloudflare

This app is **one Node.js process** that serves the website, the API, and runs the Discord bot together — the bot updates the same data the web API uses (an internal data layer, no second service to sync). That's the "run the bot on the site" pattern.

> **Does Stellar support Node?** Yes — Namecheap shared plans (Stellar included) ship cPanel's **Setup Node.js App** (Node up to 22/24). Check **cPanel → Software → "Setup Node.js App"**. If that icon is missing on your plan, skip to **[Plan B](#plan-b--no-nodejs-on-your-plan)** at the bottom.

---

## Plan A — Node.js on cPanel (recommended)

### 1. Upload the code
- **Git** (cPanel → *Git Version Control*): clone `https://github.com/realKeehan/repair-zone` into e.g. `~/repair-zone` (outside `public_html`), **or**
- **Zip**: upload + extract into `~/repair-zone` via *File Manager*. Don't upload `node_modules`.

### 2. Create the Node.js app
cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
| --- | --- |
| Node.js version | 18+ (20/22 recommended) |
| Application mode | Production |
| Application root | `repair-zone` |
| Application URL | your domain/subdomain (e.g. `repairs.yourdomain.com`) |
| Application startup file | `app.js` |

### 3. Environment variables
Add these in the Node.js App screen (not a committed `.env`):

- `TRUST_PROXY` = `1`
- `PUBLIC_BASE_URL` = `https://repairs.yourdomain.com`
- **Admin auth — pick one:**
  - App token: `ADMIN_TOKEN` = a long random string (leave `ADMIN_AUTH` blank), **or**
  - `.htaccess` Basic Auth: `ADMIN_AUTH` = `external` (see [step 6](#6-protect-the-admin-with-htaccess-basic-auth))
- **Discord** (optional): `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `DISCORD_FORUM_CHANNEL_ID`, and optionally `DISCORD_LOG_CHANNEL_ID` / `DISCORD_WEBHOOK_URL`

### 4. Install & start
- Click **Run NPM Install**.
- If using the bot: enter the virtualenv (cPanel shows the command) and run `npm run deploy-commands` once.
- Click **Restart**. Passenger listens on the socket it assigns; `app.js` boots `src/server.js`, which reads `process.env.PORT`.

### 5. Keep the bot alive (cron)
Passenger idles the app when the website gets no traffic — which would drop the bot's connection to Discord. Keep it warm with a cron ping.

cPanel → **Cron Jobs** → every 5 minutes:
```
*/5 * * * * curl -s https://repairs.yourdomain.com/healthz >/dev/null 2>&1
```
discord.js auto-reconnects across the occasional Passenger restart, so this keeps the bot effectively online all weekend. (This is the same trick most "bot on shared hosting" setups use.)

#### Bot shows **offline** / commands say "did not respond"?

Slash commands are registered by a one-time REST call, so they still **appear** in
Discord even when nothing is running to answer them — an offline bot and "the
application did not respond" are the same root cause: no live process is connected
to the gateway. Work through this:

1. **Is the app actually running?** cPanel → *Setup Node.js App* → the app should be
   **started**. Restart it and watch the log for `[discord] Logged in as … — online`.
   No such line = it never connected.
2. **Is more than one instance running?** An old process left over from before a
   redeploy can hold the token's session while your new code sits idle. In *Terminal*,
   `ps -u $USER | grep node` — kill strays, then Restart so there's exactly one.
3. **Did it crash on boot?** Look for `[discord] Bot failed to start` or
   `[discord] client error` / `gateway error` in the log. A bad `DISCORD_BOT_TOKEN`
   or a `discord.js` older than **14.27** (the modal needs the newer builders —
   check with `npm ls discord.js`) will take the bot offline.
4. **Is the cron ping actually set?** Without step 5's cron, Passenger idles the app
   and the bot drops offline between visits. Confirm the cron exists and the
   `/healthz` URL returns `{"ok":true}`.
5. **Still offline on shared hosting?** Passenger is request-driven and never
   guarantees a persistent WebSocket. If the cron trick isn't reliable enough, run
   the bot on an always-on host — see **[Plan B](#plan-b--no-nodejs-on-your-plan)**.

> Full bot setup, the token/`Authentication failed` fixes, and a **step-by-step
> server-migration checklist** live in **[BOT-SETUP.md](./BOT-SETUP.md)**.

### 6. Protect the admin with .htaccess Basic Auth
This is the "set the password in .htaccess" route. It gates `/admin` **and** `/api/admin` at Apache, so the Node app doesn't need its own token.

1. Set env var `ADMIN_AUTH=external` (step 3) and **Restart** the app. The app now trusts Apache for admin auth.
2. Create the password file `~/repair-zone/.htpasswd`. Easiest options:
   - **cPanel → Directory Privacy**, add a user (it writes a `.htpasswd` you can point to), or
   - **Terminal**: `htpasswd -c ~/repair-zone/.htpasswd admin` (prompts for the password), or
   - **Paste a line** into `~/repair-zone/.htpasswd`. Example encoding user `admin` / password `password123` (⚠️ replace with your own!):
     ```
     admin:$apr1$G9yJnd.S$vZgrIkjgF5u5Tyu3MQFnG/
     ```
     Generate your own hash: `openssl passwd -apr1 'YOURPASSWORD'` (prefix with `admin:`).
3. Merge the block from **[`.htaccess.example`](../.htaccess.example)** into the `.htaccess` in your app's **DocumentRoot** (the same file cPanel created with the `Passenger*` directives — keep those). Set `AuthUserFile` to the absolute path of your `.htpasswd` (e.g. `/home/YOURUSER/repair-zone/.htpasswd`).
4. Visit `/admin` — the browser should prompt for the login. Public pages and the request/borrow forms stay open.

### 7. Cloudflare
1. Point DNS at your Namecheap server IP (A/CNAME), **proxied** (orange cloud).
2. SSL/TLS: **Full** (or **Full (strict)** once cPanel AutoSSL has a cert).
3. `TRUST_PROXY=1` (already set) lets rate-limiting see the real client IP through Cloudflare.
4. Add a cache rule to **bypass cache** for `/api/*` and `/admin*` so the queue is always live. `/css` and `/js` cache fine.
5. Cloudflare forwards the `Authorization` header, so `.htaccess` Basic Auth works through the proxy.

### 8. Persist the data
The live queue + inventory live in `data/db.json` in the app folder; it survives restarts — just don't delete it. Back it up during the event and clear it afterward (it holds attendee contact info).

---

## Plan B — no Node.js on your plan

If your plan really has no *Setup Node.js App*, host the **whole app** (site + API + bot) on an always-on Node host and point Cloudflare DNS at it:

- **Render / Railway / Fly.io / a $5 VPS** — deploy the repo, set the env vars, run `npm start`. One service runs everything; the bot and site stay in sync automatically (shared in-process data).
- These aren't Apache, so **`.htaccess` won't apply** — use the app token (`ADMIN_TOKEN`) or **Cloudflare Access** (Zero Trust) to protect `/admin` instead.
- You can still keep the domain at Namecheap and just manage DNS through Cloudflare.

> Splitting a *static* site onto Stellar while the API/bot live elsewhere is possible but adds CORS and a split data store — not worth it here. Running the one unified app on a Node host is simpler and keeps the bot and website perfectly in sync.
