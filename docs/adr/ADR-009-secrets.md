# ADR-009 — Secrets: Doppler (preferred) or SOPS + age
**Status:** Accepted

No plaintext secrets in git. Rotate BETTER_AUTH_SECRET, DB creds, MinIO & provider
keys. Only Caddy is internet-exposed; DB/Redis/MinIO stay on the internal network.
