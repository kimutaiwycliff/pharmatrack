# PharmaTrack — Backups & Disaster Recovery

Off-site, automated, encrypted backups to **Cloudflare R2**, and a copy-paste
runbook to bring the platform back on a fresh VM in ~10 minutes.

**Why R2 (not MinIO):** MinIO runs on the same VM as everything else, so a VM
loss takes it with the database. R2 is a separate provider — it's the copy that
survives the box dying.

---

## What is backed up

| Data | Source | Cadence | Encrypted | R2 path |
|---|---|---|---|---|
| Postgres (`pharmatrack`) | `pg_dump -Fc` via container | every **2 h** | ✅ age | `db/pharmatrack-<UTC>.dump.age` |
| Product images | MinIO `pharmatrack-products` | daily | — (public assets) | `images/…` |
| `.env` (config/secrets) | the deploy dir | daily | ✅ age | `config/env-<UTC>.age` |
| Redis | — | not backed up | — | transient queue state only |

Retention: DB dumps kept `BACKUP_RETAIN_DAYS` (default **14**) days; `.env`
copies 90 days. Worst-case data loss on a VM death: **< 2 hours**.

---

## Keys you must keep OFF the VM (in your password manager)

1. **age private key** (`pharmatrack-backup.key`) — the ONLY thing that can
   decrypt a dump. If lost, every backup is useless; if leaked, they're readable.
2. **A copy of `.env`** — fastest way to reconstruct config on a new box (there's
   also an encrypted copy in R2 as a fallback).
3. **The R2 API token** (also lives in `.env`).

The VM only holds the age **public** key (`BACKUP_AGE_RECIPIENT`) — it can encrypt
but never decrypt.

---

## One-time setup (on the live VM)

```bash
# 1. Install the two tools (single static binaries)
sudo apt-get update && sudo apt-get install -y age
curl https://rclone.org/install.sh | sudo bash        # rclone

# 2. Generate the age keypair ON YOUR LAPTOP (not the VM):
#      age-keygen -o pharmatrack-backup.key
#    - put the "Public key: age1..." line into the VM's .env as BACKUP_AGE_RECIPIENT
#    - store pharmatrack-backup.key in your password manager

# 3. Fill the R2 block in the VM's .env (see .env.example):
#      R2_BUCKET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
#      BACKUP_AGE_RECIPIENT

# 4. Smoke-test a backup (should drop a file in R2 → db/)
cd ~/pharmatrack && bash infra/backup.sh db

# 5. Install cron: DB every 2h, images + .env daily at 02:15 UTC
( crontab -l 2>/dev/null; \
  echo '0 */2 * * * cd $HOME/pharmatrack && /usr/bin/flock -n /tmp/pt-backup.lock bash infra/backup.sh db   >> $HOME/pharmatrack/backup.log 2>&1'; \
  echo '15 2 * * *  cd $HOME/pharmatrack && /usr/bin/flock -n /tmp/pt-backup.lock bash infra/backup.sh assets >> $HOME/pharmatrack/backup.log 2>&1' \
) | crontab -

# 6. Confirm
crontab -l
```

`flock` prevents overlapping runs. Watch `~/pharmatrack/backup.log`.

---

## Verify backups are healthy (do this monthly)

```bash
# List recent dumps + sizes
cd ~/pharmatrack && set -a && . ./.env && set +a
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
rclone lsl "r2:${R2_BUCKET}/db/" | tail
```

A backup you have never restored is not a backup. Do a **restore drill** into a
throwaway DB at least once (below).

---

## 🔥 Recovery: the VM died, bring it back

On a fresh Ubuntu VM with Docker installed:

```bash
# 1. Get the code
git clone https://github.com/kimutaiwycliff/pharmatrack.git && cd pharmatrack

# 2. Restore config: paste your saved .env into ./.env
#    (or pull the encrypted copy from R2 — you need R2 creds + the age key handy:
#       rclone copyto r2:$R2_BUCKET/config/<latest>.age /tmp/env.age
#       age -d -i pharmatrack-backup.key -o .env /tmp/env.age )

# 3. Install tools + put the age PRIVATE key on the box, then point .env at it
sudo apt-get update && sudo apt-get install -y age
curl https://rclone.org/install.sh | sudo bash
#   copy pharmatrack-backup.key from your password manager, then in .env set:
#       BACKUP_AGE_KEYFILE=/root/pharmatrack-backup.key   (or wherever you put it)

# 4. Bring up ONLY the data plane (so we can restore before the app starts)
docker compose -p pharmatrack --env-file .env \
  -f infra/compose.core.yml -f infra/compose.prod.yml up -d postgres minio
until docker exec pharmatrack-postgres-1 pg_isready -U postgres; do sleep 2; done

# 5. Restore database + images from R2 (latest)
bash infra/restore.sh all

# 6. Start the full stack (migrations are a no-op — the dump already has them)
bash infra/deploy.sh

# 7. Re-point DNS to the new IP:
#    Cloudflare → DNS → A record for pharmatrack.co.ke → <new VM IP>
#    (If using the Cloudflare origin cert, also drop infra/certs/ back in place.)

# 8. Verify
curl -fsS https://pharmatrack.co.ke/api/health
```

Then rotate the R2 token and any secrets you consider exposed, and re-arm cron
(One-time setup step 5).

---

## Notes & limits

- This is **logical, snapshot** backup (every 2 h). Simple, off-site, fast to
  restore. You can lose up to ~2 h of writes.
- **Point-in-time recovery** (restore to any second, via pgBackRest + WAL
  archiving) is the heavier upgrade — worth it only when the tolerance drops
  below an hour. Not needed at current scale.
- The DB dump is PII — it never leaves the host unencrypted. Keep the age private
  key safe and off the VM.
