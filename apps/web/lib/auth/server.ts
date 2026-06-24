import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { organization, admin, haveIBeenPwned, captcha } from "better-auth/plugins"
import { nextCookies } from "better-auth/next-js"
import { dbAdmin, user, session, account, verification, organization as organizationTable, member, invitation } from "@pharmatrack/db"
import { sendEmail } from "@/lib/notifications/email"
import { pinLogin } from "@/lib/auth/pin-plugin"

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
  database: drizzleAdapter(dbAdmin(), {
    provider: "pg",
    schema: { user, session, account, verification, organization: organizationTable, member, invitation },
  }),
  // Built-in rate limiting for all /api/auth/* endpoints. Enabled in production
  // by default; stricter per-path rules guard the credential + email-sending
  // routes against brute force and spam. (In-memory per instance — adequate for
  // the single-VM deploy; switch to database/secondary storage if scaling out.)
  rateLimit: {
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 300, max: 10 },        // password login
      "/sign-in/pin": { window: 300, max: 10 },          // till PIN login
      "/sign-up/email": { window: 3600, max: 5 },        // direct Better Auth signup
      "/request-password-reset": { window: 3600, max: 5 },
      "/forget-password": { window: 3600, max: 5 },
      "/reset-password": { window: 3600, max: 10 },
      "/send-verification-email": { window: 3600, max: 5 },
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
  plugins: [
    organization({
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
    haveIBeenPwned({ customPasswordCompromisedMessage: "This password has appeared in a known data breach. Please choose a different one." }),
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
