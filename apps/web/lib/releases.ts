// Base public URL for the desktop/Android release bucket (Cloudflare R2,
// custom domain — object reads need no credentials, R2 serves them publicly
// once a custom domain is connected). Shared by lib/desktop/release.ts,
// lib/android/release.ts, and the two /api/*/download redirect routes, so
// the hostname lives in exactly one place.
export const RELEASES_BASE_URL = process.env.RELEASES_BASE_URL ?? "https://dl.pharmatrack.co.ke"
