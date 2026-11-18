import { NextRequest, NextResponse } from "next/server"
import { dbAdmin } from "@pharmatrack/db"
import { expireOrders } from "@/lib/cashier-station/orders"

// Cashier station (ADR-021): mark unpaid orders past their hold time as
// expired. Holds already stop counting at expires_at, so this only tidies the
// queue and the order desks' lists. Called every 5 minutes by the worker,
// secured by CRON_SECRET; idempotent.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const expired = await expireOrders(dbAdmin())
  return NextResponse.json({ expired })
}
