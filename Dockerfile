# syntax=docker/dockerfile:1

# ── Base ─────────────────────────────────────────────────────
FROM node:22-alpine AS base
# Pin the exact pnpm that generated pnpm-lock.yaml so `--frozen-lockfile`
# doesn't fail on a corepack-default version mismatch. Refresh corepack first
# to avoid the "Cannot find matching keyid" signature error on older corepack.
RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# ── Dependencies (cached on lockfile + manifests) ────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile

# ── Build ────────────────────────────────────────────────────
FROM base AS builder
# Bring the entire installed tree (root + every workspace package's node_modules,
# incl. pnpm symlinks under .pnpm). Cherry-picking individual node_modules dirs
# misses packages/{db,core,types}, breaking their drizzle-orm/postgres imports.
COPY --from=deps /app ./
# Overlay source; node_modules is .dockerignore'd so the installed deps survive.
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* are inlined into the browser bundle at BUILD time, so they must
# be present here (not just at runtime). Passed as build args from compose/.env.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_GLITCHTIP_DSN
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_GLITCHTIP_DSN=$NEXT_PUBLIC_GLITCHTIP_DSN
# Build-only placeholders. next build's "collect page data" step imports route
# modules, some of which construct the DB client / Better Auth at module top
# level (auth/server.ts calls dbAdmin()). postgres-js connects lazily, so a dummy
# URL lets module evaluation succeed without a real DB. These ENV live only in
# this builder stage (the runner is a separate FROM); real values come from the
# runtime env_file.
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
    DATABASE_AUTHENTICATED_URL=postgres://build:build@127.0.0.1:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder-secret-change-me-0123456789 \
    BETTER_AUTH_URL=http://localhost:3000
# Bound heap so the build is predictable on small build hosts.
RUN NODE_OPTIONS=--max-old-space-size=3072 pnpm --filter web build

# ── Runtime (slim, non-root, standalone output) ──────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Next's standalone server binds to process.env.HOSTNAME, which Docker sets to
# the container ID — that binds to the eth0 IP only, so the 127.0.0.1 healthcheck
# (and clean port mapping) fail. Pin it to all interfaces.
ENV HOSTNAME=0.0.0.0
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs

# Standalone server + assets (monorepo layout puts the entrypoint at apps/web/server.js)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
# Worker entrypoint — dependency-free Node script run from this same image with
# an override command (see compose `worker` service). No node_modules needed.
COPY --from=builder --chown=nextjs:nodejs /app/apps/worker ./apps/worker

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "apps/web/server.js"]
