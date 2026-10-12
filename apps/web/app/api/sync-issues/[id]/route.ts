import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { withTenant, sync_issue, audit_log } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"

const schema = z.object({ note: z.string().trim().max(500).optional() })

// Mark a sync issue resolved (with an optional note on what was done).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext({ permission: "devices.manage" })
  if ("error" in ctx) return ctx.error
  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const ok = await withTenant(ctx, async (db) => {
    const [row] = await db.update(sync_issue).set({
      status: "resolved", resolved_by: ctx.userId, resolved_at: new Date(), resolution_note: parsed.data.note ?? null,
    }).where(and(eq(sync_issue.id, id), eq(sync_issue.status, "open"))).returning({ id: sync_issue.id, kind: sync_issue.kind })
    if (!row) return false
    await db.insert(audit_log).values({
      organization_id: ctx.organizationId, actor_id: ctx.userId, action: "sync_issue.resolve",
      entity: "sync_issue", entity_id: id, diff: { kind: row.kind, note: parsed.data.note ?? null },
    })
    return true
  })
  if (!ok) return NextResponse.json({ error: "Issue not found or already resolved" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
