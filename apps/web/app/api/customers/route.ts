import { NextRequest, NextResponse } from "next/server"
import { and, asc, eq, or, ilike } from "drizzle-orm"
import { withTenant, customer } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"

// Lightweight search for the booking autocomplete (by name or phone).
export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? ""

  const ctx = await getApiContext()
  if ("error" in ctx) return ctx.error

  const rows = await withTenant(ctx.organizationId, (db) =>
    db.select({ id: customer.id, full_name: customer.full_name, phone: customer.phone, email: customer.email, reminders_opt_in: customer.reminders_opt_in })
      .from(customer)
      .where(q ? or(ilike(customer.full_name, `%${q}%`), ilike(customer.phone, `%${q}%`)) : undefined)
      .orderBy(asc(customer.full_name)).limit(10))

  return NextResponse.json({ customers: rows })
}
