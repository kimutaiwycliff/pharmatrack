import { router } from "expo-router"
import { createAuthClient } from "better-auth/react"
import { expoClient } from "@better-auth/expo/client"
import * as SecureStore from "expo-secure-store"
import { env } from "./env"
import { useStaffStore } from "../store/staff"
import { useSyncStore } from "../store/sync"
import { confirm as askConfirm } from "./confirm"
import { readDeviceToken } from "./sync/device-key"

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
  // ADR-018: a pharmacy can allow only approved devices. Every auth request
  // carries this phone's device key (when it has one) so the server can tell
  // an approved till from an unknown phone.
  fetchOptions: {
    onRequest: async (ctx) => {
      const token = await readDeviceToken()
      if (token) ctx.headers.set("x-pt-device", token)
      ctx.headers.set("x-pt-platform", "android")
      return ctx
    },
  },
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

// Shared by every sign-out entry point (POS header icon, More tab) so the
// confirm-then-redirect behavior can't drift between them again — index.tsx's
// session redirect only evaluates once at cold start, so callers must
// explicitly navigate to /login after signOut() resolves.
export async function confirmSignOut() {
  const ok = await askConfirm({ title: "Log out", message: "Are you sure you want to log out?", confirmLabel: "Log out", destructive: true })
  if (!ok) return
  // R1: signing out also releases the till — the next person picks
  // themselves (offline PIN) on a registered phone. Signing out while
  // offline must still work, so a failed server call isn't fatal.
  try {
    await signOut()
  } catch {
    // offline — the local session is cleared regardless
  }
  useStaffStore.getState().clear()
  router.replace(useSyncStore.getState().device ? "/switch-user" : "/login")
}

// The server guards email sign-in with Cloudflare Turnstile; the app gets a
// token from the site's own check page (components/CaptchaSheet) and sends it
// the same way the web login form does.
export async function signInEmail(email: string, password: string, captchaToken?: string | null) {
  return authClient.signIn.email({
    email,
    password,
    ...(captchaToken ? { fetchOptions: { headers: { "x-captcha-response": captchaToken } } } : {}),
  })
}

/** True when the server refused because the security check is missing or failed. */
export function isCaptchaFailure(err: { message?: string; code?: string } | null | undefined): boolean {
  return !!err && /captcha/i.test(`${err.code ?? ""} ${err.message ?? ""}`)
}

// Google sign-in: opens Google in a secure in-app browser tab (Chrome Custom
// Tabs — Google allows these, unlike embedded web views) and returns to the
// app through the pharmatrack:// link, signed in. @better-auth/expo handles
// the round trip; the server's `expo()` plugin and trusted "pharmatrack://"
// origin are already in place.
export async function signInGoogle() {
  return authClient.signIn.social({ provider: "google", callbackURL: "/checking" })
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
