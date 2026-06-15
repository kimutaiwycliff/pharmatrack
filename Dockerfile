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
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile

# ── Build ────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* are inlined into the browser bundle at BUILD time, so they must
# be present here (not just at runtime). Passed as build args from compose/.env.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
# Bound heap so the build is predictable on small build hosts.
RUN NODE_OPTIONS=--max-old-space-size=3072 pnpm --filter web build

# ── Runtime (slim, non-root, standalone output) ──────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs

# Standalone server + assets (monorepo layout puts the entrypoint at apps/web/server.js)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "apps/web/server.js"]
