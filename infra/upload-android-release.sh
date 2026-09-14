#!/usr/bin/env bash
#
# Uploads a single already-built Android APK (or the latest.json manifest) into
# the pharmatrack-android-releases MinIO bucket. Runs ON THE PRODUCTION BOX (over
# SSH), mirroring infra/upload-desktop-release.sh — GitHub Actions/EAS runners
# can't reach MinIO directly since it's only bound to the compose network.
#
# EAS builds Android in Expo's own cloud (not a local Android toolchain), so
# there's no CI job producing this file yet - after `eas build --profile
# direct-download --platform android` finishes, download the resulting .apk
# (`eas build:download`) and run this manually:
#
#   ./infra/upload-android-release.sh <local-apk-path> <version>
#   e.g. ./infra/upload-android-release.sh ~/Downloads/build-1234.apk 1.0.0
#
# Uploads the APK under v<version>/pharmatrack.apk, then writes latest.json.
set -euo pipefail
cd "$(dirname "$0")/.."

LOCAL_FILE="$1"
VERSION="$2"
DEST_KEY="v${VERSION}/pharmatrack.apk"

[ -f .env ] || { echo "ERROR: .env not found in $(pwd)"; exit 1; }
[ -f "$LOCAL_FILE" ] || { echo "ERROR: $LOCAL_FILE not found"; exit 1; }
set -a; . ./.env; set +a

PROJECT=pharmatrack
BUCKET="${MINIO_BUCKET_ANDROID_RELEASES:-pharmatrack-android-releases}"
FILE_DIR="$(cd "$(dirname "$LOCAL_FILE")" && pwd)"
FILE_NAME="$(basename "$LOCAL_FILE")"
MANIFEST_FILE="$(mktemp)"
printf '{"version":"%s","apkKey":"%s"}' "$VERSION" "$DEST_KEY" > "$MANIFEST_FILE"
MANIFEST_DIR="$(cd "$(dirname "$MANIFEST_FILE")" && pwd)"
MANIFEST_NAME="$(basename "$MANIFEST_FILE")"

docker run --rm --network "${PROJECT}_default" \
  -v "${FILE_DIR}:/upload:ro" -v "${MANIFEST_DIR}:/manifest:ro" \
  --entrypoint sh minio/mc -c "\
    mc alias set m http://minio:9000 '${MINIO_ACCESS_KEY}' '${MINIO_SECRET_KEY}' >/dev/null && \
    mc cp /upload/${FILE_NAME} m/${BUCKET}/${DEST_KEY} && \
    mc cp /manifest/${MANIFEST_NAME} m/${BUCKET}/latest.json"

echo "==> Uploaded ${LOCAL_FILE} -> ${BUCKET}/${DEST_KEY} (latest.json now points at v${VERSION})"
rm -f "$LOCAL_FILE" "$MANIFEST_FILE"
