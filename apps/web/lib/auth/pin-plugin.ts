import { createAuthEndpoint, APIError } from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"
import type { BetterAuthPlugin } from "better-auth"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { audit_log, dbAdmin, staff_profile } from "@pharmatrack/db"
import { normalizeKePhone } from "@/lib/auth/phone"
import { verifyPin } from "@/lib/auth/pin"
import { assertNotLocked, failedAttempt, lockedError, succeeded } from "@/lib/auth/lockout"

/**
 * Quick PIN login for the till: phone (E.164-normalized) + 4-digit PIN, verified
 * against `staff_profile.pin_hash`. On success it mints a real Better Auth
 * session (same cookie as email login), so the rest of the app — getSession,
 * getTenantContext, RLS — treats it identically. Mounted at /api/auth/sign-in/pin.
 *
 * Brute force: besides Better Auth's per-IP limit, 5 wrong PINs for one phone
 * lock that PIN for 15 minutes from any IP (lib/auth/lockout.ts) — counted for
 * unknown phones too, so the answer never reveals whether a number exists.
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
          await assertNotLocked("pin", phone)

          const [sp] = await dbAdmin()
            .select({ user_id: staff_profile.user_id, pin_hash: staff_profile.pin_hash, organization_id: staff_profile.organization_id })
            .from(staff_profile)
            .where(and(eq(staff_profile.phone, phone), eq(staff_profile.is_active, true)))
            .limit(1)
          if (!sp?.pin_hash || !(await verifyPin(ctx.body.pin, sp.pin_hash))) {
            const lockedFor = await failedAttempt("pin", phone)
            if (lockedFor > 0) {
              if (sp) {
                await dbAdmin().insert(audit_log).values({
                  organization_id: sp.organization_id, actor_id: sp.user_id, action: "auth.pin_locked", entity: "user", entity_id: sp.user_id,
                  diff: { minutes: lockedFor / 60 },
                }).catch(() => undefined)
              }
              throw lockedError("pin", lockedFor)
            }
            throw invalid
          }
          await succeeded("pin", phone)

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
