# my journal

A personal journaling tool that nudges you to check in. A Telegram bot messages you a
few times a day — _"how'd you sleep?"_, _"did you run today?"_, _"how was your day?"_ — and
whatever you reply (even a single word) is logged. A web dashboard shows your mood, sleep,
and runs over time.

## How it works

Two processes share one `src/lib`:

- **`worker`** — a long-running Node process that runs the Telegram bot (long-polling) and a
  per-minute scheduler. The scheduler fires one check-in per slot per day, in your timezone.
  Your replies are stored verbatim, then run through a signal extractor.
- **`web`** — the Next.js dashboard that reads the database and charts your trends.

### Built to grow into AI (phase 2)

The check-in text and the reply analysis sit behind two interfaces so an AI version drops in
with no rewrite:

- `PromptProvider` (`src/lib/prompts/`) — v1 `RotatingPromptProvider` picks from a curated
  catalog. Swap in a Claude-backed provider later; the scheduler calls it identically.
- `ResponseProcessor` (`src/lib/signals/`) — v1 `RuleBasedProcessor` uses keyword/sentiment
  heuristics. An AI processor implements the same interface.

Raw replies (`entries`) are stored separately from derived metrics (`signals`). Upgrading the
extractor just writes new `signals` rows over your existing history — no migration, no data loss.

## Bot commands

- **`/start`** — registers you and captures your chat id.
- **`/checkin`** — an on-demand nudge, off-schedule, with a prompt that fits the time of day.
  Force a specific theme with `/checkin morning`, `/checkin midday`, or `/checkin evening`.
- **`/help`** — a quick reminder of what the bot does.

Replying to any nudge — scheduled or `/checkin` — logs an entry.

## Setup

**Prerequisites:** Node 20+, and Postgres (the included `docker-compose.yml`, or any Postgres).

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create a Telegram bot.** In Telegram, message [@BotFather](https://t.me/BotFather), send
   `/newbot`, follow the prompts, and copy the bot token it gives you.

3. **Configure the environment.** Edit `.env` (already created; or copy `.env.example`):
   - `TELEGRAM_BOT_TOKEN` — paste the token from BotFather
   - `USER_TIMEZONE` — your IANA timezone, e.g. `Asia/Kolkata`, `America/New_York`
   - `DATABASE_URL` — the default matches the Docker Postgres below
   - `OWNER_TELEGRAM_CHAT_ID` — leave blank; captured automatically on `/start`

4. **Start Postgres**
   ```bash
   docker compose up -d
   ```

5. **Create the tables**
   ```bash
   npm run db:push
   ```

6. **Start the worker** (bot + scheduler). It seeds the prompt catalog on first run.
   ```bash
   npm run worker
   ```

7. **Say hi to your bot.** In Telegram, open your bot and send `/start`. This registers you
   (and stores your chat id), after which you'll receive check-ins at the scheduled times.
   Reply to a check-in to log an entry.

8. **Open the dashboard** (in another terminal)
   ```bash
   npm run dev
   ```
   Then visit [http://localhost:3000](http://localhost:3000).

## Customizing

- **Check-in times** — edit `SLOT_SCHEDULE` in `src/lib/scheduler/slots.ts`.
- **Prompts** — edit `src/lib/prompts/catalog.ts` (then re-seed by clearing the `prompts`
  table), or edit rows directly. `npm run db:studio` opens a DB browser.

## Deploying to a VPS

The whole stack — Postgres, the dashboard, the bot/scheduler worker, and an HTTPS
reverse proxy — runs from one compose file: `docker-compose.prod.yml`. The dashboard is
protected with HTTP Basic Auth, and [Caddy](https://caddyserver.com) fetches a TLS
certificate for your domain automatically.

**You'll need:** a Linux VPS (DigitalOcean, Hetzner, etc.) with Docker installed, ports
80/443 open, and a domain (or subdomain) you can point at the server.

1. **Point your domain at the server.** Add an `A` record, e.g. `journal.example.com` →
   your VPS IP. Caddy needs this resolving before it can issue a certificate.

2. **Get the code on the server and create `.env`.**
   ```bash
   git clone <your-repo> my-journal && cd my-journal
   cp .env.example .env
   ```
   Edit `.env`:
   - `TELEGRAM_BOT_TOKEN` — from @BotFather
   - `USER_TIMEZONE` — your IANA timezone
   - `DASHBOARD_PASSWORD` — a strong password; this gates the dashboard
   - `DOMAIN` — the hostname from step 1, e.g. `journal.example.com`
   - leave `DATABASE_URL` as-is (the stack points it at the bundled Postgres) and
     `OWNER_TELEGRAM_CHAT_ID` blank (captured on `/start`)

3. **Start everything.** This builds the image, runs migrations once, then brings up
   Postgres, the worker, the dashboard, and the proxy:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

4. **Say hi to your bot.** Open it in Telegram and send `/start` to register.

5. **Open the dashboard** at `https://journal.example.com` and sign in with your
   `DASHBOARD_USER` (default `journal`) / `DASHBOARD_PASSWORD`.

**Day-to-day:**

- Logs: `docker compose -f docker-compose.prod.yml logs -f worker` (or `web`)
- Update after a code change: `git pull && docker compose -f docker-compose.prod.yml up -d --build`
- Stop: `docker compose -f docker-compose.prod.yml down` (add `-v` to also delete the database)

No domain yet? Set `DOMAIN=:80` to serve plain HTTP at `http://<your-vps-ip>` — but your
Basic Auth password then travels unencrypted, so use it only for a quick test.

### Cheaper: build off the server (run on a ~$4/mo box)

`next build` needs ~1–2 GB RAM, so the cheapest VPSes can't build the image themselves.
Build it on your laptop (or CI), push it to a registry, and have the server only pull and
run it — then a 512 MB–1 GB box is plenty. Use `docker-compose.deploy.yml` instead of the
prod file:

```bash
# On your laptop (repo root). Build for the SERVER's CPU arch and push:
echo "$GITHUB_TOKEN" | docker login ghcr.io -u YOUR_GH_USERNAME --password-stdin
docker buildx build --platform linux/amd64 -t ghcr.io/YOUR_GH_USERNAME/my-journal:latest --push .

# On the server (only docker-compose.deploy.yml + Caddyfile + .env needed — no source):
docker login ghcr.io -u YOUR_GH_USERNAME   # skip if you made the package public
docker compose -f docker-compose.deploy.yml pull
docker compose -f docker-compose.deploy.yml up -d
```

Set `IMAGE` in `.env` to the tag you pushed. Use `--platform linux/arm64` instead if your
VPS is ARM (e.g. Hetzner CAX). To update later: rebuild + push from the laptop, then
`docker compose -f docker-compose.deploy.yml pull && docker compose -f docker-compose.deploy.yml up -d`.

**Automate the build with CI.** `.github/workflows/publish-image.yml` builds and pushes the
image to `ghcr.io/<owner>/<repo>` on every push to `main` (native amd64 — no laptop
emulation, no secrets to configure beyond the built-in `GITHUB_TOKEN`). Set
`IMAGE=ghcr.io/<your-username>/<repo>:latest` in the server's `.env`; deploying then becomes
just the `pull` + `up -d` step. First run creates the package as private — either make it
public on github.com or `docker login ghcr.io` on the server so it can pull.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dashboard in dev mode |
| `npm run worker` | Bot + scheduler (watch mode) |
| `npm run worker:start` | Bot + scheduler (no watch, for prod) |
| `npm run build` / `start` | Build / serve the dashboard |
| `npm run db:push` | Sync schema to the database |
| `npm run db:generate` / `db:migrate` | Generate / apply SQL migrations |
| `npm run db:studio` | Open Drizzle Studio (DB browser) |
