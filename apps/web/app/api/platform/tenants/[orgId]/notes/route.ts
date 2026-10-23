import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { desc, eq } from "drizzle-orm"
import { audit_log, organization, platform_tenant_note, user } from "@pharmatrack/db"
import { getPlatformContext } from "@/lib/platform"

// Operator follow-up log for one pharmacy (calls, WhatsApp, notes) — the
// "who did we last talk to, and when do we follow up" memory of the console.

export async function GET(_request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { orgId } = await params
  const notes = await ctx.db.select({
    id: platform_tenant_note.id, kind: platform_tenant_note.kind, body: platform_tenant_note.body,
    follow_up_on: platform_tenant_note.follow_up_on, created_at: platform_tenant_note.created_at,
    author: user.name, author_email: user.email,
  }).from(platform_tenant_note)
    .leftJoin(user, eq(user.id, platform_tenant_note.author_id))
    .where(eq(platform_tenant_note.organization_id, orgId))
    .orderBy(desc(platform_tenant_note.created_at)).limit(100)
  return NextResponse.json({ notes })
}

const body = z.object({
  kind: z.enum(["note", "call", "whatsapp", "email", "visit"]).default("note"),
  body: z.string().trim().min(1, "Write something first").max(2000),
  follow_up_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { orgId } = await params
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid note" }, { status: 400 })
  const [org] = await ctx.db.select({ id: organization.id }).from(organization).where(eq(organization.id, orgId)).limit(1)
  if (!org) return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })

  const [note] = await ctx.db.insert(platform_tenant_note).values({
    organization_id: orgId, author_id: ctx.user.id, kind: parsed.data.kind, body: parsed.data.body,
    follow_up_on: parsed.data.follow_up_on ?? null,
  }).returning()
  await ctx.db.insert(audit_log).values({
    organization_id: orgId, actor_id: ctx.user.id, action: "platform.note_add", entity: "platform_tenant_note", entity_id: note!.id,
    diff: { kind: parsed.data.kind, follow_up_on: parsed.data.follow_up_on ?? null },
  })
  return NextResponse.json({ note }, { status: 201 })
}
