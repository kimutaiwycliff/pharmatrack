import { z } from "zod"

// EXPO_PUBLIC_-prefixed vars are inlined by Expo's bundler at build time from
// .env files (or eas.json's build.<profile>.env) — no expo-constants indirection
// needed. Validated at import time so a missing/malformed value fails loudly on
// app start rather than surfacing as a confusing network error mid-shift.
const envSchema = z.object({
  // Optional, not required: ADR-014's Offline Edition build (see
  // EXPO_PUBLIC_OFFLINE_MODE below) has no server at all, so there is no
  // URL to validate. Every online-only code path (apiFetch, the online
  // login form, catalogue/queued-sale sync) must check OFFLINE_MODE before
  // touching this rather than assume it's always set.
  EXPO_PUBLIC_API_URL: z.string().url().optional(),
  // Optional: crash reporting is a no-op until this is set (see
  // src/lib/crash-reporting.ts) — there's no GlitchTip project/DSN
  // provisioned for mobile yet, same as web's currently-empty GLITCHTIP_DSN.
  EXPO_PUBLIC_GLITCHTIP_DSN: z.string().url().optional(),
  // ADR-014 — mirrors web's OFFLINE_MODE: set only in the Offline Edition
  // EAS build profile. Everything else (online login, apiFetch, the
  // catalogue/sale sync engine) stays exactly as it is today when unset.
  EXPO_PUBLIC_OFFLINE_MODE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
})

const parsed = envSchema.safeParse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_GLITCHTIP_DSN: process.env.EXPO_PUBLIC_GLITCHTIP_DSN || undefined,
  EXPO_PUBLIC_OFFLINE_MODE: process.env.EXPO_PUBLIC_OFFLINE_MODE,
})

if (!parsed.success) {
  throw new Error(`Invalid mobile app environment: ${parsed.error.message}`)
}

export const env = parsed.data
