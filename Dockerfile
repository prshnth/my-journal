# syntax=docker/dockerfile:1

# One image serves all three roles: web (next start), worker (tsx), and one-shot
# migrations (drizzle-kit). It keeps devDependencies because the worker runs the
# TypeScript source directly via tsx and migrations use drizzle-kit.

FROM node:22-bookworm-slim AS base
WORKDIR /app

# --- deps: install all dependencies (incl. dev: tsx, drizzle-kit, next toolchain) ---
FROM base AS deps
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci

# --- build: compile the Next.js dashboard ---
FROM base AS build
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# env.ts parses process.env and db/index.ts constructs the Postgres client at import
# time, so `next build` needs these present. They are placeholders used only during
# the build (the pg client connects lazily) — real values come from the container env.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
ENV TELEGRAM_BOT_TOKEN=build-placeholder
RUN npm run build

# --- runner: source + full node_modules + built .next ---
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=build /app/.next ./.next
EXPOSE 3000
# Default role is the web server; the worker/migrate services override the command.
CMD ["npm", "run", "start"]
