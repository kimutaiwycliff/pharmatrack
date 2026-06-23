# TLS certs (orange-cloud only)

This directory is mounted read-only into the Caddy container at
`/etc/caddy/certs`. It is only used in **orange-cloud** mode (Cloudflare-proxied).

When using `Caddyfile.cloudflare`, place your **Cloudflare Origin Certificate**
here:

- `origin.pem` — the certificate
- `origin.key` — the private key (`chmod 600`)

Both are **gitignored** (`*.pem` / `*.key`) — never commit them.

In **grey-cloud** mode (the default `Caddyfile`), this directory stays empty —
Caddy gets a Let's Encrypt cert automatically and ignores these files.
