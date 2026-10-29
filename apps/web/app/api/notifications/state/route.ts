import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { withTenant, notification_state } from "@pharmatrack/db"
import { getTenantContext } from "@/lib/auth/helpers"
import { stateFor } from "@/lib/notifications/bell"
import { zodErrorResponse } from "@/lib/api/errors"

// The bell (components/layout/NotificationsMenu.tsx): mark alerts seen when
// it's opened, dismiss one until it changes, snooze it, or bring dismissed
// ones back. Per person, so it follows them across devices.

const schema = z.object({
  action: z.enum(["seen", "dismiss", "snooze_day", "snooze_week", "restore"]),
  items: z.array(z.object({ key: z.string().min(1).max(120), fp: z.string().max(200) })).min(1).max(200),
})

export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return zodErrorResponse(parsed.error)
  const { action, items } = parsed.data
  const now = new Date()

  await withTenant(ctx, async (db) => {
    // "Show dismissed alerts": bring back everything this person dismissed or snoozed.
    if (action === "restore" && items.length === 1 && items[0]!.key === "*") {
      await db.update(notification_state).set({ dismissed_fp: null, dismissed_until: null, updated_at: now }).where(eq(notification_state.user_id, ctx.userId))
      return
    }
    for (const item of items) {
      const values = { ...stateFor(action, item, now), updated_at: now }
      await db.insert(notification_state)
        .values({ organization_id: ctx.organizationId, user_id: ctx.userId, key: item.key, ...values })
        .onConflictDoUpdate({ target: [notification_state.user_id, notification_state.key], set: values })
    }
  })
  return NextResponse.json({ ok: true })
}
