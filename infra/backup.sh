#!/usr/bin/env bash
#
# Off-site backup for PharmaTrack → Cloudflare R2 (S3-compatible).
#
#   infra/backup.sh db       # pg_dump → age-encrypt → upload → prune (every 2h)
#   infra/backup.sh assets   # MinIO images + encrypted .env           (daily)
#   infra/backup.sh all      # both
#
# Why off-site: MinIO lives on THIS VM, so a VM loss takes it with everything
# else. R2 is a separate provider — the copy that survives the box dying.
#
# The DB dump contains PII (customer phones, allergies, auth), so it is ALWAYS
# age-encrypted before it leaves the host. The public key can live in .env; only
# the private key (kept in your password manager) can decrypt it. See restore.sh.
#
# Run from the deploy dir (must contain .env + infra/). Install once via cron —
# see DISASTER_RECOVERY.md.
set -euo pipefail

MODE="${1:-all}"
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "ERROR: .env not found in $(pwd)"; exit 1; }
set -a; . ./.env; set +a

# ── Requirements ─────────────────────────────────────────────────────────────
for bin in docker rclone age; do
  command -v "$bin" >/dev/null || { echo "ERROR: '$bin' not installed. See DISASTER_RECOVERY.md."; exit 1; }
done
: "${R2_BUCKET:?set R2_BUCKET in .env}"
: "${R2_ACCOUNT_ID:?set R2_ACCOUNT_ID in .env}"
: "${R2_ACCESS_KEY_ID:?set R2_ACCESS_KEY_ID in .env}"
: "${R2_SECRET_ACCESS_KEY:?set R2_SECRET_ACCESS_KEY in .env}"
: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT (age public key) in .env}"

PROJECT="${PROJECT:-pharmatrack}"
PG_CONTAINER="${PROJECT}-postgres-1"
DB="${POSTGRES_DB:-pharmatrack}"
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-14}"
TS="$(date -u +%Y-%m-%dT%H%MZ)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
log() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# ── rclone remotes built from .env (no rclone.conf needed) ───────────────────
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_ACL=private
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

backup_db() {
  log "pg_dump ${DB} (custom format, compressed)"
  docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" "$PG_CONTAINER" \
    pg_dump -U postgres -Fc "$DB" > "$TMP/db.dump"
  local size; size=$(du -h "$TMP/db.dump" | cut -f1)
  log "  dump size: $size"

  log "age-encrypting"
  age -r "$BACKUP_AGE_RECIPIENT" -o "$TMP/db.dump.age" "$TMP/db.dump"

  log "uploading → r2:${R2_BUCKET}/db/pharmatrack-${TS}.dump.age"
  rclone copyto "$TMP/db.dump.age" "r2:${R2_BUCKET}/db/pharmatrack-${TS}.dump.age"

  log "pruning db dumps older than ${RETAIN_DAYS}d"
  rclone delete --min-age "${RETAIN_DAYS}d" "r2:${R2_BUCKET}/db/" || true
  log "  ✓ db backup complete"
}

backup_assets() {
  # Product images: unencrypted (public assets), incremental sync. MinIO isn't
  # published to the host in prod, so reach it over the compose network from a
  # containerised rclone (which also has internet egress to R2).
  local bucket="${MINIO_BUCKET_PRODUCTS:-pharmatrack-products}"
  log "syncing MinIO images (${bucket}) → r2:${R2_BUCKET}/images"
  docker run --rm --network "${PROJECT}_default" \
    -e RCLONE_CONFIG_MINIO_TYPE=s3 -e RCLONE_CONFIG_MINIO_PROVIDER=Minio \
    -e RCLONE_CONFIG_MINIO_ACCESS_KEY_ID="${MINIO_ACCESS_KEY:-minioadmin}" \
    -e RCLONE_CONFIG_MINIO_SECRET_ACCESS_KEY="${MINIO_SECRET_KEY:-minioadmin}" \
    -e RCLONE_CONFIG_MINIO_ENDPOINT="http://minio:9000" \
    -e RCLONE_CONFIG_MINIO_FORCE_PATH_STYLE=true \
    -e RCLONE_CONFIG_R2_TYPE=s3 -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    -e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
    -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    -e RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
    -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
    rclone/rclone sync "minio:${bucket}" "r2:${R2_BUCKET}/images" || log "  (image sync skipped — MinIO empty or unreachable)"

  # .env holds the config/secrets needed to boot the stack — encrypt + keep more.
  log "age-encrypting + uploading .env → r2:${R2_BUCKET}/config"
  age -r "$BACKUP_AGE_RECIPIENT" -o "$TMP/env.age" .env
  rclone copyto "$TMP/env.age" "r2:${R2_BUCKET}/config/env-${TS}.age"
  rclone delete --min-age 90d "r2:${R2_BUCKET}/config/" || true
  log "  ✓ assets backup complete"
}

case "$MODE" in
  db)     backup_db ;;
  assets) backup_assets ;;
  all)    backup_db; backup_assets ;;
  *)      echo "usage: $0 {db|assets|all}"; exit 2 ;;
esac
log "done."
