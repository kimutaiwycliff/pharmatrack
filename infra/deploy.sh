#!/usr/bin/env bash
#
# Production deploy for the single-VM EC2 host. Pulls the published image (no
# on-box build), brings up the data plane, applies dbmate migrations, ensures the
# MinIO bucket, then starts web + worker + Caddy. Idempotent — safe to re-run for
# updates. Run from the deploy directory (which must contain .env + infra/).
#
#   ./infra/deploy.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "ERROR: .env not found in $(pwd)"; exit 1; }
set -a; . ./.env; set +a

PROJECT=pharmatrack
COMPOSE=(docker compose -p "$PROJECT" --env-file .env -f infra/compose.core.yml -f infra/compose.prod.yml)
DBMATE_URL="postgres://app_owner:${APP_OWNER_PASSWORD}@postgres:5432/${POSTGRES_DB}?sslmode=disable"

echo "==> Pulling app image (kimutaiwycliff/pharmatrack-web:latest)"
"${COMPOSE[@]}" --profile app pull web worker

echo "==> Starting data plane (postgres, redis, minio)"
"${COMPOSE[@]}" up -d postgres redis minio

echo "==> Waiting for Postgres to accept connections"
until docker exec "${PROJECT}-postgres-1" pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done

echo "==> Applying migrations (dbmate)"
docker run --rm --network "${PROJECT}_default" \
  -v "$(pwd)/infra/migrations:/db/migrations" \
  -e DATABASE_URL="$DBMATE_URL" \
  ghcr.io/amacneil/dbmate:2 --migrations-dir /db/migrations --no-dump-schema up

echo "==> Ensuring MinIO buckets (${MINIO_BUCKET_PRODUCTS}, ${MINIO_BUCKET_DESKTOP_RELEASES:-pharmatrack-desktop-releases})"
docker run --rm --network "${PROJECT}_default" --entrypoint sh minio/mc -c "\
  mc alias set m http://minio:9000 '${MINIO_ACCESS_KEY}' '${MINIO_SECRET_KEY}' >/dev/null && \
  mc mb -p m/${MINIO_BUCKET_PRODUCTS} >/dev/null 2>&1 || true; \
  mc anonymous set download m/${MINIO_BUCKET_PRODUCTS} >/dev/null 2>&1 || true; \
  mc mb -p m/${MINIO_BUCKET_DESKTOP_RELEASES:-pharmatrack-desktop-releases} >/dev/null 2>&1 || true" \
  || echo "  (bucket step skipped)"
# Desktop releases bucket stays private (no anonymous policy) - it's only ever
# read by the app server via /api/desktop/download/<key>, same as MinIO itself
# never being reachable from the internet directly.

echo "==> Starting web + worker + Caddy"
"${COMPOSE[@]}" --profile app --profile edge up -d

echo "==> Waiting for the app to report healthy"
for i in $(seq 1 30); do
  if docker exec "${PROJECT}-web-1" wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "    healthy."
    break
  fi
  sleep 3
done

echo "==> Done. App: https://${APP_DOMAIN:-<APP_DOMAIN not set>}"
echo "    Logs: ${COMPOSE[*]} logs -f web worker caddy"
