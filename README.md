# my journal

A personal journaling tool that nudges you to check in. A Telegram bot messages you a
few times a day — _"how'd you sleep?"_, _"did you run today?"_, _"how was your day?"_ — and
whatever you reply (even a single word) is logged. A web dashboard keeps your journal,
completed runs, and todos together.

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
- **`/plan`** — today's session from the 6-month running plan (`/plan tomorrow` peeks ahead).
- **`/todos`** — list your open todos; `/todos <thing>` adds one.
- **`/done <number>`** — check a todo off (numbers match `/todos`).
- **`/help`** — a quick reminder of what the bot does.

Replying to any nudge — scheduled or `/checkin` — logs an entry. When you use Telegram's
Reply action, the entry is matched to that exact nudge; ordinary messages fall back to the
most recent check-in.

### Daily training nudge

Every morning at 7:00 (your timezone) the bot sends that day's session from a 6-month
return-to-running plan — the workout, strength/mobility extras, target effort, and a
"short on time?" minimum option so there are never zero days. The plan lives in
`src/lib/training/plan.json` (one row per day, Jul 19 2026 – Jan 18 2027), based on the
spreadsheet and shifted one day so training starts on July 19. It is validated when the app
starts; swap the JSON to change plans.

The worker can catch up a missed morning send until noon. If Telegram rejects a send, the
daily claim is released so a later scheduler tick can retry it. After a running session,
reply to the training message with something like:

```text
done, 25 min, energy 4/5, pain 0/10
```

The raw reply stays in the journal, while completion, minutes, energy, and pain are stored as
derived signals for the Runs tab.

### Dashboard tabs

- **Journal** — searchable raw entries plus an 18-week consistency grid.
- **Runs** — today's planned session, totals, a run consistency grid, 12-week volume bars,
  and recent run notes with minutes, energy, and pain.
- **Todos** — add, complete, reopen, and delete todos captured on the web or in Telegram.

JSON and Markdown exports include journal entries, runs, and todos.

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

5. **Create or update the tables**
   ```bash
   npm run db:migrate
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
   Then visit [http://localhost:3000](http://localhost:3000) and use the Journal, Runs, and
   Todos tabs.

## Customizing

- **Check-in times** — edit `SLOT_SCHEDULE` in `src/lib/scheduler/slots.ts`. The training
  nudge time is `TRAINING` and the braindump time is `BRAINDUMP` in the same file.
- **Prompts** — edit `src/lib/prompts/catalog.ts` (then re-seed by clearing the `prompts`
  table), or edit rows directly. `npm run db:studio` opens a DB browser.
- **Running plan** — replace `src/lib/training/plan.json` (same fields, one object per day).
  The loader rejects malformed or duplicate-dated plan rows at startup.

## Deploying to a VPS

The recommended deployment builds the image in GitHub Actions, then lets a low-memory VPS
pull it and run Postgres, migrations, the dashboard, worker, and Caddy. Follow
[DEPLOY.md](DEPLOY.md) for the current end-to-end instructions. The migration service applies
new schema changes, including run minutes and pain tracking, before the web and worker start.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dashboard in dev mode |
| `npm test` | Focused scheduler, signal extractor, and training-plan tests |
| `npm run worker` | Bot + scheduler (watch mode) |
| `npm run worker:start` | Bot + scheduler (no watch, for prod) |
| `npm run build` / `start` | Build / serve the dashboard |
| `npm run db:push` | Directly sync schema during local experimentation |
| `npm run db:generate` / `db:migrate` | Generate / apply SQL migrations |
| `npm run db:studio` | Open Drizzle Studio (DB browser) |
