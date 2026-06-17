# Deploying *my journal* to a $4–6/mo VPS

**The model:** the VPS is too small to compile a Next.js app, so nothing is built on it.
GitHub Actions builds the image and pushes it to a registry; the server only pulls and runs
it.

```
laptop ──git push──▶ GitHub Actions ──build amd64 + push──▶ ghcr.io
                                                               │ (server pulls)
                                                               ▼
   VPS ▸ Caddy :443 ──▶ web ┐
                        worker ├── all wired by docker-compose.deploy.yml ──▶ Postgres
                       migrate ┘
```

## What you need

- A **GitHub account** with this repo pushed (CI lives in `.github/workflows/publish-image.yml`).
- A **VPS provider** account — DigitalOcean, Hetzner, Vultr, or Linode.
- A **domain** (or a free DuckDNS subdomain) — required for HTTPS.
- A **Telegram bot token** from [@BotFather](https://t.me/BotFather).

| Pick | Recommendation | Cost |
| --- | --- | --- |
| Server | DigitalOcean **$4** (512 MB, +swap) or **$6** (1 GB); Hetzner **CX22** (4 GB) ≈ €4.5 is the best value | ~$4–6/mo |
| OS | Ubuntu 24.04 LTS | — |
| Registry | GitHub Container Registry (`ghcr.io`) — free, built into CI | free |
| Domain | Porkbun/Cloudflare (~$10/yr) or DuckDNS (free) | $0–10/yr |

> 512 MB runs single-user fine **with swap** (Step 7). Bump to 1 GB if you want headroom.

---

## Phase A — Build the image (CI)

**1. Push the repo to GitHub.** The workflow triggers on pushes to `main`.

```bash
git add -A
git commit -m "Deploy stack + CI image build"
git remote add origin https://github.com/prshnth/my-journal.git   # if not already set
git push -u origin main
```

> Your default branch **must be `main`** (the workflow listens on `main`). If it's `master`,
> rename it or edit `branches:` in the workflow.

**2. Watch it build.** Repo → **Actions** tab → "Publish image". First run takes ~2–4 min. It
produces `ghcr.io/prshnth/my-journal` tagged `latest` and the commit SHA.

**3. Make the image pullable.** Repo → **Packages** → open `my-journal`:

- **Simplest:** Package settings → **Change visibility → Public** (the image contains no
  secrets — they're injected at runtime), so the server pulls with no login; **or**
- keep it private and run `docker login ghcr.io` on the server in Phase C.

> **Prefer not to use CI?** Build on your laptop instead (Docker Desktop required):
>
> ```bash
> echo "$GH_TOKEN" | docker login ghcr.io -u prshnth --password-stdin
> docker buildx build --platform linux/amd64 -t ghcr.io/prshnth/my-journal:latest --push .
> ```

---

## Phase B — Provision the server

**4. Create the VPS.** Provider console → new server → **Ubuntu 24.04** → cheapest size
(DO $4/$6, or Hetzner CX22) → **add your SSH key** → create. Copy the **public IP**.
*(No SSH key yet? Run `ssh-keygen -t ed25519` locally and paste `~/.ssh/id_ed25519.pub`.)*

**5. Point your domain at it.** At your DNS provider add an **`A` record**: host `journal` →
your server IP (or set a DuckDNS subdomain's IP). Confirm it resolves:

```bash
dig +short journal.yourdomain.com     # must print your server IP
```

**6. SSH in and open the firewall.** Port 80 must stay open or Caddy can't get a certificate.

```bash
ssh root@YOUR_SERVER_IP
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

**7. Install Docker + add swap.**

```bash
curl -fsSL https://get.docker.com | sh
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
docker --version && docker compose version    # confirm both work
```

---

## Phase C — Configure & launch

**8. Copy the two stack files** (run on your **laptop** — no source code goes to the server):

```bash
scp docker-compose.deploy.yml Caddyfile root@YOUR_SERVER_IP:/root/my-journal/
```

**9. Create `.env` on the server.**

```bash
ssh root@YOUR_SERVER_IP
cd /root/my-journal
nano .env
```

```ini
DATABASE_URL=postgres://journal:journal@db:5432/journal
TELEGRAM_BOT_TOKEN=123456:paste-from-botfather
USER_TIMEZONE=Asia/Kolkata
OWNER_TELEGRAM_CHAT_ID=
DASHBOARD_USER=journal
DASHBOARD_PASSWORD=choose-a-strong-password
DOMAIN=journal.yourdomain.com
IMAGE=ghcr.io/prshnth/my-journal:latest
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`. *(All-lowercase `IMAGE`. Leave `OWNER_TELEGRAM_CHAT_ID`
blank — captured on `/start`.)*

**10. Pull and start.**

```bash
docker login ghcr.io -u prshnth      # skip if you made the package public
docker compose -f docker-compose.deploy.yml pull
docker compose -f docker-compose.deploy.yml up -d
docker compose -f docker-compose.deploy.yml logs -f
```

Healthy startup looks like: `migrate` runs and exits 0 → `worker` prints
`bot @yourbot polling` → `caddy` logs `certificate obtained`. `Ctrl+C` stops following logs
(containers keep running). Check status anytime with
`docker compose -f docker-compose.deploy.yml ps`.

---

## Phase D — Connect

**11.** Open your bot in Telegram, send **`/start`** (registers you + stores your chat id).

**12.** Visit **`https://journal.yourdomain.com`** → the browser prompts for credentials →
enter `DASHBOARD_USER` (default `journal`) / `DASHBOARD_PASSWORD`. Reply to a check-in and
watch it land on the dashboard.

**13.** Want a nudge off-schedule? Send **`/checkin`** anytime (or `/checkin morning | midday
| evening` to pick the theme). Replying logs an entry just like a scheduled nudge.

---

## Operating it

**Ship an update** — CI rebuilds on push; the server just re-pulls:

```bash
git push                                                              # laptop → CI builds
docker compose -f docker-compose.deploy.yml pull && \
docker compose -f docker-compose.deploy.yml up -d                     # server
```

**Back up your journal** (the data lives in the `journal_pgdata` volume — back it up so a dead
droplet doesn't lose your history):

```bash
docker compose -f docker-compose.deploy.yml exec db \
  pg_dump -U journal journal > journal-$(date +%F).sql
```

**Common commands:**

```bash
docker compose -f docker-compose.deploy.yml logs -f worker   # bot/scheduler logs
docker compose -f docker-compose.deploy.yml restart worker   # restart one service
docker compose -f docker-compose.deploy.yml down             # stop all (add -v to also wipe the DB)
```

## Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| Actions fails 403 on push | Repo → Settings → Actions → General → **Workflow permissions → Read and write** |
| Workflow never ran | Default branch isn't `main` → rename it or edit `branches:` in the workflow |
| Server pull: `denied` / `unauthorized` | Package is private → `docker login ghcr.io` on the server, or make the package public |
| Container exits instantly / `exec format error` | Image built for the wrong CPU → rebuild with `--platform linux/amd64` (or `arm64` for an ARM box) |
| No HTTPS; caddy logs an ACME error | DNS not pointing at the server, or port 80 blocked → fix the `A` record / `ufw allow 80` |
| Dashboard won't accept the password | `DASHBOARD_USER`/`DASHBOARD_PASSWORD` mismatch; if the password is blank the dashboard is open |
| Container OOM-killed | Add swap (Step 7) or move to the 1 GB box |
| Bot silent | Wrong `TELEGRAM_BOT_TOKEN`, or worker not running → check `logs -f worker`; send `/start` first |
