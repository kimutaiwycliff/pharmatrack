import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq, inArray, sql } from "drizzle-orm"
import { audit_log, org_settings, platform_tenant_note } from "@pharmatrack/db"
import { getPlatformContext } from "@/lib/platform"
import { buildOverview } from "@/lib/insights/overview"
import { ownerContact } from "@/lib/notifications/billing"
import { sendEmail } from "@/lib/notifications/email"
import { CAMPAIGN_ID, campaignEmail, campaignGroup, type CampaignGroup, type CampaignStage } from "@/lib/notifications/campaign"

// Platform → Send an update: the one-off setup-guide email to pharmacy owners.
// Operator only. Each pharmacy gets it once (audit_log campaign.<id>); every
// send also lands in the follow-up log with a "follow up on" date two days
// out, so non-responders show under "Follow-ups due" for a WhatsApp nudge.

const REPLY_TO = () => process.env.PLATFORM_REPLY_TO?.trim() || "kimutaiwycliff90@gmail.com"
const APP_URL = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmatrack.co.ke").replace(/\/$/, "")
const ACTION = `campaign.${CAMPAIGN_ID}`

interface Recipient {
  org: string; pharmacy: string; group: CampaignGroup; stage: CampaignStage; status: string | null
  owner_email: string | null; owner_name: string | null; sent: boolean
}

type Ctx = NonNullable<Awaited<ReturnType<typeof getPlatformContext>>>

async function recipients(ctx: Ctx): Promise<Recipient[]> {
  const { tenants } = await buildOverview()
  const now = Date.now()
  const ids = tenants.map((t) => t.id)
  const [settings, sent] = await Promise.all([
    ids.length ? ctx.db.select({ org: org_settings.organization_id, settings: org_settings.settings }).from(org_settings).where(inArray(org_settings.organization_id, ids)) : [],
    ctx.db.select({ org: audit_log.organization_id }).from(audit_log).where(eq(audit_log.action, ACTION)),
  ])
  const optOut = new Set(settings.filter((s) => (s.settings as { updates_opt_out?: boolean })?.updates_opt_out === true).map((s) => s.org))
  const sentSet = new Set(sent.map((s) => s.org))
  const out: Recipient[] = []
  for (const t of tenants) {
    const group = campaignGroup({ name: t.name, setupStage: t.setupStage, subscriptionStatus: t.subscriptionStatus, renewsAt: t.renewsAt, optedOut: optOut.has(t.id) }, now)
    if (!group) continue
    const owner = await ownerContact(t.id)
    out.push({ org: t.id, pharmacy: t.name, group, stage: t.setupStage, status: t.subscriptionStatus, owner_email: owner?.email ?? null, owner_name: owner?.name ?? null, sent: sentSet.has(t.id) })
  }
  return out.sort((a, b) => a.group.localeCompare(b.group) || a.pharmacy.localeCompare(b.pharmacy))
}

function emailFor(r: Pick<Recipient, "group" | "owner_name" | "pharmacy" | "stage">) {
  return campaignEmail(r.group, {
    appUrl: APP_URL(), firstName: r.owner_name?.split(" ")[0] ?? "", pharmacy: r.pharmacy, stage: r.stage, replyTo: REPLY_TO(),
  })
}

export async function GET() {
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json({ campaign: CAMPAIGN_ID, reply_to: REPLY_TO(), recipients: await recipients(ctx) })
}

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), orgId: z.string().min(1) }),
  z.object({ action: z.literal("test") }),
  z.object({ action: z.literal("send"), orgIds: z.array(z.string().min(1)).min(1).max(500) }),
])

export async function POST(request: NextRequest) {
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const parsed = postSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const d = parsed.data
  const list = await recipients(ctx)

  if (d.action === "preview") {
    const r = list.find((x) => x.org === d.orgId)
    if (!r) return NextResponse.json({ error: "Not in any group" }, { status: 404 })
    return NextResponse.json({ ...emailFor(r), to: r.owner_email, reply_to: REPLY_TO() })
  }

  if (d.action === "test") {
    // One of each group, filled in with a real pharmacy from that group, to you.
    const to = process.env.PLATFORM_NOTIFY_EMAIL?.split(",")[0]?.trim() || ctx.user.email
    for (const g of ["extend", "nudge", "selling"] as CampaignGroup[]) {
      const sample = list.find((r) => r.group === g) ?? { group: g, pharmacy: "Sample Pharmacy", owner_name: "Faith", stage: "no_products" as CampaignStage }
      const m = emailFor(sample)
      await sendEmail(to, `[TEST] ${m.subject}`, m.html, { replyTo: REPLY_TO() })
    }
    return NextResponse.json({ ok: true, to })
  }

  // send
  const wanted = new Set(d.orgIds)
  const results: Array<{ org: string; status: string }> = []
  const followUp = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
  for (const r of list) {
    if (!wanted.has(r.org)) continue
    if (r.sent) { results.push({ org: r.org, status: "already_sent" }); continue }
    if (!r.owner_email) { results.push({ org: r.org, status: "no_email" }); continue }
    const m = emailFor(r)
    const res = await sendEmail(r.owner_email, m.subject, m.html, { replyTo: REPLY_TO() })
    if (res.status !== "sent") { results.push({ org: r.org, status: res.status }); continue }
    await ctx.db.insert(audit_log).values({
      organization_id: r.org, actor_id: ctx.user.id, action: ACTION, entity: "organization", entity_id: r.org,
      diff: { group: r.group, subject: m.subject, to: r.owner_email },
    })
    await ctx.db.insert(platform_tenant_note).values({
      organization_id: r.org, author_id: ctx.user.id, kind: "email",
      body: `Sent the setup-guide email ("${m.subject}"). No reply in 2 days → WhatsApp them.`, follow_up_on: followUp,
    })
    results.push({ org: r.org, status: "sent" })
  }
  return NextResponse.json({ results, sent: results.filter((x) => x.status === "sent").length })
}

const patchSchema = z.object({ orgId: z.string().min(1), optOut: z.boolean() })

/** "Reply STOP" — stop sending this pharmacy updates. */
export async function PATCH(request: NextRequest) {
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const patch = { updates_opt_out: parsed.data.optOut }
  await ctx.db.insert(org_settings).values({ organization_id: parsed.data.orgId, settings: patch })
    .onConflictDoUpdate({ target: org_settings.organization_id, set: { settings: sql`${org_settings.settings} || ${JSON.stringify(patch)}::jsonb`, updated_at: new Date() } })
  await ctx.db.insert(audit_log).values({
    organization_id: parsed.data.orgId, actor_id: ctx.user.id, action: "updates.opt_out", entity: "organization", entity_id: parsed.data.orgId, diff: patch,
  })
  return NextResponse.json({ ok: true })
}
