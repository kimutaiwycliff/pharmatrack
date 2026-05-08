import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const updateSchema = z.object({
  role: z.enum(["manager", "pharmacist", "cashier"]).optional(),
  branch_id: z.string().uuid().nullable().optional(),
  phone: z.string().optional(),
  is_active: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single()
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  if (!["owner", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Prevent editing own record or escalating to owner
  if (id === user.id) {
    return NextResponse.json({ error: "Cannot edit your own profile here" }, { status: 400 })
  }

  const body = (await request.json()) as unknown
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  }

  // Ensure target is in same org
  const { data: target } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", id)
    .single()

  if (!target || target.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
  }

  // Managers cannot edit other managers or owners
  if (profile.role === "manager" && ["owner", "manager"].includes(target.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
  }

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({
      ...(parsed.data.role !== undefined && { role: parsed.data.role }),
      ...(parsed.data.branch_id !== undefined && { branch_id: parsed.data.branch_id }),
      ...(parsed.data.phone !== undefined && { phone: parsed.data.phone }),
      ...(parsed.data.is_active !== undefined && { is_active: parsed.data.is_active }),
    })
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ staff: updated })
}
