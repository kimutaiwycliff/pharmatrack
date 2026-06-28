#!/usr/bin/env bash
#
# One-command production release from a dev machine. Foolproof by design — it
# closes the gaps that bit us before:
#   1. Cross-builds linux/amd64 (a Mac builds arm64 by default → unhealthy box).
#   2. VERIFIES the pushed digest actually changed (Docker Hub can fail the push
#      on a transient DNS error while the build "succeeds").
#   3. Ships infra/ (esp. migrations) to the server BEFORE the on-box deploy, so
#      the image never lands ahead of its schema migrations.
#   4. Runs the pull-based on-box deploy (pull → dbmate → up → health).
#   5. Confirms the just-pushed image is the one actually running.
#
# Usage:  ./scripts/release.sh        (from the repo root)
# Override via env: PEM, SERVER, IMAGE, BUILDER, APP_URL, REMOTE_DIR, ENV_PROD
set -euo pipefail

PEM="${PEM:-clif.pem}"
SERVER="${SERVER:-ubuntu@52.209.226.85}"
IMAGE="${IMAGE:-kimutaiwycliff/pharmatrack-web}"
BUILDER="${BUILDER:-ptbuilder}"
APP_URL="${APP_URL:-https://pharmatrack.co.ke}"
REMOTE_DIR="${REMOTE_DIR:-pharmatrack}"   # ~/pharmatrack on the server
ENV_PROD="${ENV_PROD:-.env.production}"

cd "$(dirname "$0")/.."
ssh_() { ssh -i "$PEM" -o ConnectTimeout=20 "$SERVER" "$@"; }
say()  { printf '\n==> %s\n' "$*"; }
META="$(mktemp -t pt-release.XXXX.json)"

[ -f "$PEM" ] || { echo "ERROR: SSH key not found: $PEM"; exit 1; }
command -v docker >/dev/null || { echo "ERROR: docker not found"; exit 1; }
SITE_KEY="$(grep -E '^NEXT_PUBLIC_TURNSTILE_SITE_KEY=' "$ENV_PROD" 2>/dev/null | cut -d= -f2- || true)"

# Ensure a container-driver builder exists (needed to --push cross-platform).
docker buildx inspect "$BUILDER" >/dev/null 2>&1 || \
  docker buildx create --name "$BUILDER" --driver docker-container --bootstrap >/dev/null

say "building + pushing linux/amd64"
# --metadata-file gives the authoritative pushed digest without a separate
# (rate-limited) registry call. If the push fails, buildx exits non-zero (set -e),
# so reaching the next line already proves the push landed.
docker buildx build --builder "$BUILDER" --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_APP_URL="$APP_URL" \
  --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY="$SITE_KEY" \
  -t "$IMAGE:latest" -t "$IMAGE:prod" -f Dockerfile --metadata-file "$META" --push .

NEW="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('containerimage.digest',''))" "$META" 2>/dev/null || true)"
[ -n "$NEW" ] || NEW="$(grep -o 'sha256:[0-9a-f]\{64\}' "$META" | head -1 || true)"
rm -f "$META"
say "pushed digest: $NEW"
[ -n "$NEW" ] || { echo "ERROR: could not read the pushed image digest from build metadata."; exit 1; }

say "shipping infra/ (migrations, compose, Caddyfiles) to the server"
rsync -az -e "ssh -i $PEM" --exclude 'certs/*' --exclude 'backups/*' \
  infra Caddyfile Caddyfile.cloudflare "$SERVER:$REMOTE_DIR/"

say "running on-box deploy"
ssh_ "cd $REMOTE_DIR && bash infra/deploy.sh"

say "verifying the new image is running"
RUNNING="$(ssh_ "docker inspect pharmatrack-web-1 --format '{{.Image}}'")"
if [ "$RUNNING" = "$NEW" ]; then
  echo "  ✓ running image matches the pushed digest"
else
  echo "  WARNING: running image ($RUNNING) != pushed ($NEW). Investigate before trusting this release."; exit 1
fi
curl -fsS --max-time 20 "$APP_URL/api/health" >/dev/null && echo "  ✓ $APP_URL/api/health OK"
say "release complete."
