import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { withTenant, branch, subscription, plan } from "@pharmatrack/db"
import { effectivePlanCode } from "@pharmatrack/core"
import { getTenantContext } from "@/lib/auth/helpers"
import { platformContact } from "@/lib/platform-contact"
import { effectiveSubscriptionStatus } from "@/lib/billing/subscription-status"

// ADR-013 — the only new backend surface the Android app needed. Mirrors the
// tenant/branch context the web app gets for free from a server-rendered
// layout (apps/web/lib/auth/app-shell.ts) as a plain REST endpoint, since the
// RN app has no server component to resolve it in. Read-only, no new tables.
//
// subStatus/planCode/contact were added after an audit found that web's
// SubscriptionGate (apps/web/components/SubscriptionGate.tsx) is enforced
// ONLY at the Next.js page-layout level — apps/web/app/(dashboard)/layout.tsx
// and apps/web/app/(pos)/layout.tsx, never inside getTenantContext() or any
// /api/* route. A client that talks to the API directly (i.e. mobile) got no
// enforcement of subscription status at all. Returning the same fields
// loadAppShell() resolves for web lets mobile render its own equivalent gate
// client-side — the same trust model web itself already relies on (a
// modified client could bypass either), not a downgrade from it.
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const branches = await withTenant(ctx, (db) =>
    db
      .select({ id: branch.id, name: branch.name })
      .from(branch)
      .where(eq(branch.is_active, true)),
  )

  const [sub] = await withTenant(ctx, (db) =>
    db
      .select({
        status: subscription.status,
        trial_ends_at: subscription.trial_ends_at,
        current_period_end: subscription.current_period_end,
        planCode: plan.code,
      })
      .from(subscription)
      .leftJoin(plan, eq(plan.id, subscription.plan_id))
      .where(eq(subscription.organization_id, ctx.organizationId))
      .limit(1),
  )

  const contact = platformContact()

  return NextResponse.json({
    organizationId: ctx.organizationId,
    role: ctx.role,
    branchId: ctx.branchId,
    branches,
    subStatus: sub ? effectiveSubscriptionStatus(sub) : null,
    planCode: effectivePlanCode(sub?.status, sub?.planCode),
    contact: { whatsappLink: contact.whatsappLink, mailtoLink: contact.mailtoLink },
  })
}
