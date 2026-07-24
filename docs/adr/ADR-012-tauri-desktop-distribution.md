# ADR-012 — Tauri desktop app + self-hosted distribution
**Status:** Accepted

Native Windows/macOS desktop app via Tauri v2 (`apps/desktop`) — a thin shell whose
window loads the deployed site directly (`https://pharmatrack.co.ke`), no bundled
frontend, same backend/session/RLS/offline queue as the browser. Adds system tray,
single-instance, window-state persistence, hide-to-tray on close, and auto-update.

**Distribution**: not GitHub Releases — the repo is private, so release assets aren't
publicly downloadable without GitHub auth. Installers are built in CI (`windows-latest`
+ `macos-latest` runners, since Tauri can't cross-compile a GUI app with a native
webview from macOS to Windows) and hosted in a MinIO bucket
(`pharmatrack-desktop-releases`), following the same pattern already used for product
images (`lib/storage/minio.ts` + a streaming `/api/desktop/download/<key>` route — MinIO
itself is never exposed to the internet). A single `latest.json` manifest doubles as
both the Tauri updater feed and the source the landing page reads for current download
links.

**Signing**: shipped unsigned for the first release (no Apple notarization, no Windows
code-signing cert) — the download page explains the SmartScreen/Gatekeeper click-through
steps. Revisit once there's revenue to justify the cost. The Tauri *updater* signing
keypair (separate from OS code-signing — required regardless, for the updater to trust
downloaded updates) is real, generated via `tauri signer generate`.
