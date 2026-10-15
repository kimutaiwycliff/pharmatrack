import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { withTenant, appointment } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { zUuid } from "@/lib/api/validation"

const body = z.object({ outcome: z.enum(["called", "no_answer"]).nullable() })

// Record the outcome of the reminder phone call ("Called", "No answer"), or
// clear it (null). Confirming the booking itself uses PATCH status=confirmed.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!zUuid().safeParse(id).success) return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
  const ctx = await getApiContext({ permission: "appointments.manage" })
  if ("error" in ctx) return ctx.error
  const parsed = body.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) return NextResponse.json({ error: "Choose called or no answer" }, { status: 400 })

  const [row] = await withTenant(ctx, (db) =>
    db.update(appointment).set({
      contact_outcome: parsed.data.outcome,
      contacted_at: parsed.data.outcome ? new Date() : null,
      contacted_by: parsed.data.outcome ? ctx.userId : null,
      updated_at: new Date(),
    }).where(eq(appointment.id, id)).returning({ id: appointment.id, contact_outcome: appointment.contact_outcome, contacted_at: appointment.contacted_at }),
  )
  if (!row) return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
  return NextResponse.json({ id: row.id, contact_outcome: row.contact_outcome, contacted_at: row.contacted_at?.toISOString() ?? null })
}
