#!/usr/bin/env bash
#
# Uploads a single already-built desktop installer (or the latest.json manifest)
# into the pharmatrack-desktop-releases MinIO bucket. Runs ON THE PRODUCTION BOX
# (invoked over SSH by the CI desktop-release jobs) - GitHub Actions runners can't
# reach MinIO directly since it's only bound to the compose network, same reason
# infra/deploy.sh already provisions the bucket the same way.
#
#   ./infra/upload-desktop-release.sh <local-file-path> <destination-key>
#   e.g. ./infra/upload-desktop-release.sh /tmp/PharmaTrack_0.1.0_x64-setup.exe \
#          v0.1.0/PharmaTrack_0.1.0_x64-setup.exe
#
set -euo pipefail
cd "$(dirname "$0")/.."

LOCAL_FILE="$1"
DEST_KEY="$2"

[ -f .env ] || { echo "ERROR: .env not found in $(pwd)"; exit 1; }
[ -f "$LOCAL_FILE" ] || { echo "ERROR: $LOCAL_FILE not found"; exit 1; }
set -a; . ./.env; set +a

PROJECT=pharmatrack
BUCKET="${MINIO_BUCKET_DESKTOP_RELEASES:-pharmatrack-desktop-releases}"
FILE_DIR="$(cd "$(dirname "$LOCAL_FILE")" && pwd)"
FILE_NAME="$(basename "$LOCAL_FILE")"

docker run --rm --network "${PROJECT}_default" \
  -v "${FILE_DIR}:/upload:ro" \
  --entrypoint sh minio/mc -c "\
    mc alias set m http://minio:9000 '${MINIO_ACCESS_KEY}' '${MINIO_SECRET_KEY}' >/dev/null && \
    mc cp /upload/${FILE_NAME} m/${BUCKET}/${DEST_KEY}"

echo "==> Uploaded ${LOCAL_FILE} -> ${BUCKET}/${DEST_KEY}"
rm -f "$LOCAL_FILE"
