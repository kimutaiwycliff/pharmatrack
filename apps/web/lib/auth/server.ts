import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { organization, admin, haveIBeenPwned, captcha } from "better-auth/plugins"
import { nextCookies } from "better-auth/next-js"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { expo } from "@better-auth/expo"
import { dbAdmin, user, session, account, verification, organization as organizationTable, member, invitation } from "@pharmatrack/db"
import { sendEmail } from "@/lib/notifications/email"
import { pinLogin } from "@/lib/auth/pin-plugin"
import { assertNotLocked, failedAttempt, succeeded } from "@/lib/auth/lockout"
import { authRateLimitStorage } from "@/lib/rate-limit"
import { OFFLINE_MODE } from "@/lib/offline-mode"
import { recordActivity, sourceFromUserAgent } from "@/lib/insights/activity"
import { checkSignInDevice } from "@/lib/devices/lock"

// Third-party integrations are opt-in via env so local/dev runs without keys.
const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
const turnstileConfigured = !!process.env.TURNSTILE_SECRET_KEY

// ADR-002 — Better Auth owns identity; the `organization` plugin models tenants
// (orgs = tenants), `admin` plugin gates platform operators. PIN login is a
// custom credential (see lib/auth/pin) layered on top.
//
// SETUP STEP (run once, then commit the generated schema + migration):
//   npx @better-auth/cli@latest generate   # emits the Drizzle tables for these
//   options into packages/db; then create a dbmate migration from them.
// The config below is the source of truth the CLI reads.

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // ADR-013 — the Android app's custom deep-link scheme, trusted alongside the
  // web origin (implicit from baseURL) so Better Auth's origin/CSRF check
  // accepts requests once the `expo` plugin rewrites `expo-origin` → `origin`.
  trustedOrigins: ["pharmatrack://"],
  database: drizzleAdapter(dbAdmin(), {
    provider: "pg",
    schema: { user, session, account, verification, organization: organizationTable, member, invitation },
  }),
  // Built-in rate limiting for all /api/auth/* endpoints, per client IP (Caddy
  // sets X-Forwarded-For to Cloudflare's CF-Connecting-IP). Enabled in
  // production by default; stricter per-path rules guard the credential +
  // email-sending routes. Counts live in Redis (lib/rate-limit.ts, atomic
  // INCR) so a deploy or restart doesn't reset them. Per-ACCOUNT lockouts for
  // password and PIN sign-in are separate (lib/auth/lockout.ts).
  rateLimit: {
    window: 60,
    max: 100,
    customStorage: authRateLimitStorage,
    customRules: {
      "/sign-in/email": { window: 300, max: 10 },        // password login
      "/sign-in/pin": { window: 300, max: 10 },          // till PIN login
      "/sign-up/email": { window: 3600, max: 5 },        // closed publicly (see hooks.before)
      "/request-password-reset": { window: 3600, max: 5 },
      "/forget-password": { window: 3600, max: 5 },
      "/reset-password": { window: 3600, max: 10 },
      "/send-verification-email": { window: 3600, max: 5 },
    },
  },
  // Public email sign-up is CLOSED. Every account is created server-side via
  // `auth.api.signUpEmail()` — self-serve signup (after email-OTP + trial
  // eligibility checks, lib/provisioning.ts), the first-run /setup operator,
  // operator provisioning and staff invites. `emailAndPassword.disableSignUp`
  // can't be used: it also rejects those internal calls. Instead this hook
  // rejects only requests that arrived over HTTP (`ctx.request` is set by the
  // router; direct `auth.api.*` calls carry no Request), so
  // POST /api/auth/sign-up/email can't mint verified-looking accounts that
  // skip OTP and the one-trial-per-person checks.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email" && ctx.request) {
        throw new APIError("FORBIDDEN", { message: "Sign up at /signup to create a PharmaTrack account." })
      }
      // Password brute force across many IPs: a locked account answers 429.
      if (ctx.path === "/sign-in/email" && ctx.request) {
        const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? "").trim().toLowerCase()
        if (email) await assertNotLocked("password", email)
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email" || !ctx.request) return
      const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? "").trim().toLowerCase()
      if (!email) return
      const r = ctx.context.returned as { statusCode?: number } | undefined
      if (r && typeof r === "object" && r.statusCode === 401) await failedAttempt("password", email)
      else if (!(r && typeof r === "object" && typeof r.statusCode === "number" && r.statusCode >= 400)) await succeeded("password", email)
    }),
  },
  // Operator insights: every new session is a sign-in (email, Google, PIN,
  // the phone app). Fire-and-forget — recordActivity never throws.
  databaseHooks: {
    session: {
      create: {
        // Approved devices only (ADR-018): one gate for every sign-in method.
        // Throws DEVICE_NOT_APPROVED (no session) when the pharmacy's lock
        // applies; otherwise records which approved device this session is on.
        before: async (s, ctx) => {
          const headers = ctx?.headers ?? ctx?.request?.headers ?? null
          const { deviceId } = await checkSignInDevice({ userId: s.userId, headers })
          if (deviceId) return { data: { ...s, deviceId } }
        },
        after: async (s) => {
          void recordActivity({ userId: s.userId, organizationId: s.activeOrganizationId as string | null | undefined, source: sourceFromUserAgent(s.userAgent), login: true })
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    // Don't auto-create a session on sign-up. With the nextCookies plugin a
    // server-side signUpEmail would otherwise write the NEW user's session
    // cookie onto the caller's response — which would log an operator in as the
    // tenant they just provisioned. Setup and self-serve signup sign in
    // explicitly after creating the account.
    autoSignIn: false,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(
        user.email,
        "Reset your PharmaTrack password",
        `<p>Reset your password:</p><p><a href="${url}">${url}</a></p>`,
      )
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(
        user.email,
        "Verify your PharmaTrack email",
        `<p>Verify your email:</p><p><a href="${url}">${url}</a></p>`,
      )
    },
  },
  // Google sign-in for faster onboarding. New Google users land with no tenant;
  // the /home router sends them to /onboarding to name their pharmacy. Enabled
  // only when credentials are configured.
  ...(googleConfigured
    ? { socialProviders: { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! } } }
    : {}),
  // The approved device a session signed in on (ADR-018) — set by the
  // session.create.before hook, never by the client.
  session: {
    additionalFields: {
      deviceId: { type: "string", required: false, input: false },
    },
  },
  plugins: [
    // ADR-013 — Android app auth. Translates an incoming `Authorization: Bearer`
    // header into a request-scoped session cookie (so every plugin below this
    // one just sees a normal cookie session) and echoes the current token back
    // via `set-auth-token` on any response that sets a session cookie, including
    // /sign-in/pin and /sign-in/email. Purely additive — web cookie login is
    // unaffected. Placed first so downstream plugins see the translated cookie.
    // ADR-013 — Android app auth. `@better-auth/expo`'s client manages a
    // cookie jar in SecureStore (captures Set-Cookie, replays it as a Cookie
    // header on later requests) rather than bearer tokens — so this plugin's
    // only job is rewriting the `expo-origin` header the client sends (RN has
    // no browser Origin header) to `origin`, so /sign-in/pin and /sign-in/email
    // pass Better Auth's origin-trust check against `trustedOrigins` above.
    expo(),
    organization({
      // Tenants are only ever created by our own provisioning code (dbAdmin
      // inserts), never through the plugin's public /organization/create —
      // closing it stops a signed-in user from minting extra orgs.
      allowUserToCreateOrganization: false,
      sendInvitationEmail: async (data) => {
        const url = `${process.env.NEXT_PUBLIC_APP_URL}/auth/accept-invite?id=${data.id}`
        await sendEmail(
          data.email,
          `You're invited to ${data.organization.name} on PharmaTrack`,
          `<p>Accept your invitation:</p><p><a href="${url}">${url}</a></p>`,
        )
      },
    }),
    admin(),
    pinLogin(),
    // Reject passwords found in known breaches (k-anonymity range query to HIBP;
    // no API key, password never leaves as plaintext). Applies to sign-up,
    // password change and reset — including our signup (provision → signUpEmail).
    // Skipped entirely in OFFLINE_MODE (ADR-014): this is the one unconditional
    // network call in the whole auth stack, and an offline install never has
    // internet to make it — leaving it enabled would hang/fail every signup,
    // password change, and reset on that build.
    ...(OFFLINE_MODE ? [] : [haveIBeenPwned({ customPasswordCompromisedMessage: "This password has appeared in a known data breach. Please choose a different one." })]),
    // Cloudflare Turnstile on LOGIN only. The token is sent as the
    // `x-captcha-response` header by LoginForm. We deliberately do NOT guard
    // `/sign-up/email` here: the captcha plugin's onRequest fires for internal
    // `auth.api.signUpEmail()` calls too, which would break the first-run
    // operator at /setup and operator-invited owners (provisionTenant) — neither
    // carries a widget. Public self-serve signup is instead bot-protected at
    // `/api/signup/send-otp` (verifyTurnstile) + email-OTP verification + rate
    // limiting, so sign-up is covered without tripping the internal callers.
    ...(turnstileConfigured
      ? [captcha({
          provider: "cloudflare-turnstile",
          secretKey: process.env.TURNSTILE_SECRET_KEY!,
          endpoints: ["/sign-in/email"],
        })]
      : []),
    // MUST be last — applies Set-Cookie headers from auth.api.* calls made inside
    // Next.js server actions (e.g. signOut clearing the session cookie, sign-in
    // setting it). Without it the cookie is never written and middleware loops.
    nextCookies(),
  ],
})

export type Auth = typeof auth
