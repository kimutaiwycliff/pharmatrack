import { z } from "zod"

// EXPO_PUBLIC_-prefixed vars are inlined by Expo's bundler at build time from
// .env files (or eas.json's build.<profile>.env) — no expo-constants indirection
// needed. Validated at import time so a missing/malformed value fails loudly on
// app start rather than surfacing as a confusing network error mid-shift.
const envSchema = z.object({
  EXPO_PUBLIC_API_URL: z.string().url(),
  // Optional: crash reporting is a no-op until this is set (see
  // src/lib/crash-reporting.ts) — there's no GlitchTip project/DSN
  // provisioned for mobile yet, same as web's currently-empty GLITCHTIP_DSN.
  EXPO_PUBLIC_GLITCHTIP_DSN: z.string().url().optional(),
})

const parsed = envSchema.safeParse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_GLITCHTIP_DSN: process.env.EXPO_PUBLIC_GLITCHTIP_DSN || undefined,
})

if (!parsed.success) {
  throw new Error(`Invalid mobile app environment: ${parsed.error.message}`)
}

export const env = parsed.data
