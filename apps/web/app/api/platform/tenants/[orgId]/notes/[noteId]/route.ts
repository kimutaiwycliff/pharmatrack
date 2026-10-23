import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { audit_log, platform_tenant_note } from "@pharmatrack/db"
import { getPlatformContext } from "@/lib/platform"
import { zUuid } from "@/lib/api/validation"

// DELETE /api/platform/tenants/[orgId]/notes/[noteId] — remove a follow-up note.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ orgId: string; noteId: string }> }) {
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { orgId, noteId } = await params
  if (!zUuid().safeParse(noteId).success) return NextResponse.json({ error: "Invalid note" }, { status: 400 })
  const [gone] = await ctx.db.delete(platform_tenant_note)
    .where(and(eq(platform_tenant_note.id, noteId), eq(platform_tenant_note.organization_id, orgId)))
    .returning({ id: platform_tenant_note.id })
  if (!gone) return NextResponse.json({ error: "Note not found" }, { status: 404 })
  await ctx.db.insert(audit_log).values({ organization_id: orgId, actor_id: ctx.user.id, action: "platform.note_delete", entity: "platform_tenant_note", entity_id: noteId })
  return NextResponse.json({ ok: true })
}
