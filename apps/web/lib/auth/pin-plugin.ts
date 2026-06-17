import { createAuthEndpoint, APIError } from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"
import type { BetterAuthPlugin } from "better-auth"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { dbAdmin, staff_profile } from "@pharmatrack/db"
import { normalizeKePhone } from "@/lib/auth/phone"
import { verifyPin } from "@/lib/auth/pin"

/**
 * Quick PIN login for the till: phone (E.164-normalized) + 4-digit PIN, verified
 * against `staff_profile.pin_hash`. On success it mints a real Better Auth
 * session (same cookie as email login), so the rest of the app — getSession,
 * getTenantContext, RLS — treats it identically. Mounted at /api/auth/sign-in/pin.
 */
export function pinLogin(): BetterAuthPlugin {
  return {
    id: "pin-login",
    endpoints: {
      signInPin: createAuthEndpoint(
        "/sign-in/pin",
        {
          method: "POST",
          body: z.object({
            phone: z.string().min(1),
            pin: z.string().min(4).max(8),
          }),
        },
        async (ctx) => {
          const invalid = new APIError("UNAUTHORIZED", { message: "Invalid phone or PIN" })
          const phone = normalizeKePhone(ctx.body.phone)

          const [sp] = await dbAdmin()
            .select({ user_id: staff_profile.user_id, pin_hash: staff_profile.pin_hash })
            .from(staff_profile)
            .where(and(eq(staff_profile.phone, phone), eq(staff_profile.is_active, true)))
            .limit(1)
          if (!sp?.pin_hash) throw invalid
          if (!(await verifyPin(ctx.body.pin, sp.pin_hash))) throw invalid

          const user = await ctx.context.internalAdapter.findUserById(sp.user_id)
          if (!user) throw invalid

          const session = await ctx.context.internalAdapter.createSession(user.id)
          if (!session) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Could not start session" })
          await setSessionCookie(ctx, { session, user })

          return ctx.json({ token: session.token, user: { id: user.id } })
        },
      ),
    },
  }
}
