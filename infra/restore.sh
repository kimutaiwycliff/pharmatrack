#!/usr/bin/env bash
#
# Restore PharmaTrack from Cloudflare R2 onto a running data plane.
#
#   infra/restore.sh              # restore DB (latest) + images
#   infra/restore.sh db           # DB only
#   infra/restore.sh images       # images only
#   infra/restore.sh db <key>     # a specific dump, e.g. pharmatrack-2026-07-01T1300Z.dump.age
#
# Prereqs on THIS box (see DISASTER_RECOVERY.md):
#   - .env present with R2_* creds (restore your saved .env first)
#   - the age PRIVATE key on disk, path in BACKUP_AGE_KEYFILE (from your password
#     manager — this is the only thing that can decrypt a dump)
#   - the postgres container already up (docker compose up -d postgres)
set -euo pipefail

WHAT="${1:-all}"
KEY="${2:-}"
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "ERROR: .env not found — restore your saved .env here first"; exit 1; }
set -a; . ./.env; set +a

for bin in docker rclone age; do
  command -v "$bin" >/dev/null || { echo "ERROR: '$bin' not installed. See DISASTER_RECOVERY.md."; exit 1; }
done
: "${R2_BUCKET:?set R2_BUCKET in .env}"
: "${R2_ACCOUNT_ID:?set R2_ACCOUNT_ID in .env}"
: "${R2_ACCESS_KEY_ID:?set R2_ACCESS_KEY_ID in .env}"
: "${R2_SECRET_ACCESS_KEY:?set R2_SECRET_ACCESS_KEY in .env}"

PROJECT="${PROJECT:-pharmatrack}"
PG_CONTAINER="${PROJECT}-postgres-1"
DB="${POSTGRES_DB:-pharmatrack}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
log() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

restore_db() {
  : "${BACKUP_AGE_KEYFILE:?set BACKUP_AGE_KEYFILE to your age private key (from your password manager)}"
  [ -f "$BACKUP_AGE_KEYFILE" ] || { echo "ERROR: age key not found: $BACKUP_AGE_KEYFILE"; exit 1; }

  if [ -z "$KEY" ]; then
    log "finding latest dump in r2:${R2_BUCKET}/db/"
    KEY="$(rclone lsf "r2:${R2_BUCKET}/db/" | grep '\.dump\.age$' | sort | tail -1)"
    [ -n "$KEY" ] || { echo "ERROR: no dumps found in r2:${R2_BUCKET}/db/"; exit 1; }
  fi
  log "using dump: $KEY"

  log "downloading + decrypting"
  rclone copyto "r2:${R2_BUCKET}/db/${KEY}" "$TMP/db.dump.age"
  age -d -i "$BACKUP_AGE_KEYFILE" -o "$TMP/db.dump" "$TMP/db.dump.age"

  # No --no-owner: app_owner exists (created by infra/db/init), so we keep the
  # original object ownership the RLS model depends on.
  log "restoring into ${DB} (pg_restore --clean --if-exists)"
  docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" "$PG_CONTAINER" \
    pg_restore -U postgres --clean --if-exists -d "$DB" < "$TMP/db.dump"
  log "  ✓ database restored"
}

restore_images() {
  # MinIO isn't published to the host in prod — reach it over the compose network
  # from a containerised rclone (same pattern as backup.sh).
  local bucket="${MINIO_BUCKET_PRODUCTS:-pharmatrack-products}"
  log "restoring images r2:${R2_BUCKET}/images → MinIO (${bucket})"
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
    rclone/rclone sync "r2:${R2_BUCKET}/images" "minio:${bucket}"
  log "  ✓ images restored"
}

case "$WHAT" in
  db)     restore_db ;;
  images) restore_images ;;
  all)    restore_db; restore_images ;;
  *)      echo "usage: $0 {db|images|all} [dump-key]"; exit 2 ;;
esac
log "restore complete. Now run: bash infra/deploy.sh"
