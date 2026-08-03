import { z } from "zod"

// EXPO_PUBLIC_-prefixed vars are inlined by Expo's bundler at build time from
// .env files (or eas.json's build.<profile>.env) — no expo-constants indirection
// needed. Validated at import time so a missing/malformed value fails loudly on
// app start rather than surfacing as a confusing network error mid-shift.
const envSchema = z.object({
  EXPO_PUBLIC_API_URL: z.string().url(),
})

const parsed = envSchema.safeParse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
})

if (!parsed.success) {
  throw new Error(`Invalid mobile app environment: ${parsed.error.message}`)
}

export const env = parsed.data
