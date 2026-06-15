import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { organization, admin } from "better-auth/plugins"
import { dbAdmin } from "@pharmatrack/db"
import { sendEmail } from "@/lib/notifications/email"

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
  database: drizzleAdapter(dbAdmin(), { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
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
  ],
})

export type Auth = typeof auth
