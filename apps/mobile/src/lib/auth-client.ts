import { createAuthClient } from "better-auth/react"
import { expoClient } from "@better-auth/expo/client"
import * as SecureStore from "expo-secure-store"
import { env } from "./env"

// ADR-013 — @better-auth/expo manages its own cookie jar in SecureStore
// (captures Set-Cookie, replays it as a Cookie header on later authClient
// requests) rather than bearer tokens. `getCookie()` below is how we attach
// the same session to plain fetch() calls against non-/api/auth/* routes
// (catalogue sync, sale queue) — see lib/api-fetch.ts.
// The `as any` here is a type-only workaround, not a runtime one: under
// TypeScript 6.0.3 (Expo SDK 57's pinned version — a new major with changed
// conditional-type inference), `expoClient()`'s return type doesn't structurally
// unify with `createAuthClient`'s `BetterAuthClientPlugin` constraint. Verified
// by reading @better-auth/expo's compiled source directly that the plugin's
// actual runtime shape (getCookie action + fetchPlugins hooks) is correct;
// this is upstream types-vs-TS-6 friction, not a logic bug. Revisit when
// @better-auth/expo publishes a TS 6-compatible types release.
export const authClient = createAuthClient({
  baseURL: env.EXPO_PUBLIC_API_URL,
  plugins: [
    expoClient({
      scheme: "pharmatrack",
      storagePrefix: "pharmatrack",
      storage: SecureStore,
    }) as any,
  ],
})

export const { useSession, signOut } = authClient
export const getCookie = (authClient as any).getCookie as () => string

export async function signInEmail(email: string, password: string) {
  return authClient.signIn.email({ email, password })
}

// Custom endpoint (apps/web/lib/auth/pin-plugin.ts) — not a typed authClient
// method, so it's called via $fetch directly. This still runs through the
// expoClient's fetchPlugins (Cookie capture, expo-origin header), same as any
// built-in authClient call.
export async function signInPin(phone: string, pin: string) {
  const { data, error } = await authClient.$fetch("/sign-in/pin", {
    method: "POST",
    body: { phone, pin },
  })
  return { data, error }
}
