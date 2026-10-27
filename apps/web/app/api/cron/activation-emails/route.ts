import { NextRequest, NextResponse } from "next/server"
import { and, eq, like } from "drizzle-orm"
import { audit_log, dbAdmin } from "@pharmatrack/db"
import { buildOverview } from "@/lib/insights/overview"
import { ownerContact } from "@/lib/notifications/billing"
import { sendEmail } from "@/lib/notifications/email"
import { activationEmail, activationEmailDue, type ActivationKind } from "@/lib/notifications/activation"

// Activation emails (ADR-019): help new trial pharmacies reach their first
// sale. Called hourly by the worker, secured by CRON_SECRET. Sends nothing
// unless ACTIVATION_EMAILS_ENABLED=1 (the wording waits for owner approval).
// Each email goes to a pharmacy once (audit_log activation.email.<kind>).
// ?preview=1 returns what would be sent now, without sending.
export const dynamic = "force-dynamic"

const CORE_DONE = { no_products: 1, no_prices: 2, no_stock: 3, no_sale: 4, selling: 5 } as const

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const preview = request.nextUrl.searchParams.get("preview") === "1"
  if (!preview && process.env.ACTIVATION_EMAILS_ENABLED !== "1") return NextResponse.json({ status: "disabled" })

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmatrack.co.ke").replace(/\/$/, "")
  const { tenants } = await buildOverview()
  const now = Date.now()
  const db = dbAdmin()
  const out: Array<{ org: string; kind: ActivationKind; subject: string; html?: string; result?: string }> = []

  for (const t of tenants) {
    const ageHours = (now - t.createdAt) / 3_600_000
    const trialing = t.subscriptionStatus === "trialing"
    if (!trialing || ageHours > 14 * 24) continue
    const rows = await db.select({ action: audit_log.action }).from(audit_log)
      .where(and(eq(audit_log.organization_id, t.id), like(audit_log.action, "activation.email.%")))
    const sent = new Set(rows.map((r) => r.action.slice("activation.email.".length) as ActivationKind))
    const kind = activationEmailDue({ ageHours, stage: t.setupStage, trialing, sent })
    if (!kind) continue

    const owner = await ownerContact(t.id)
    if (!owner?.email) continue
    const mail = activationEmail(kind, {
      appUrl, firstName: owner.name?.split(" ")[0] ?? "", pharmacy: t.name, stage: t.setupStage,
      trialDaysLeft: t.renewsAt ? Math.max(0, Math.ceil((t.renewsAt - now) / 86_400_000)) : 0,
      coreDone: CORE_DONE[t.setupStage], coreTotal: 5,
    })
    if (preview) {
      out.push({ org: t.id, kind, subject: mail.subject, html: mail.html })
      continue
    }
    const result = await sendEmail(owner.email, mail.subject, mail.html)
    await db.insert(audit_log).values({
      organization_id: t.id, action: `activation.email.${kind}`, entity: "organization", entity_id: t.id,
      diff: { stage: t.setupStage, result: JSON.parse(JSON.stringify(result ?? null)) },
    })
    out.push({ org: t.id, kind, subject: mail.subject, result: "sent" })
  }
  return NextResponse.json({ status: preview ? "preview" : "ok", emails: out })
}
