import { NextResponse } from "next/server"
import { getApiContext } from "@/lib/api-auth"
import { paystackConfigured } from "@/lib/billing/paystack"

// Owner-facing billing summary: their subscription + plan + recent payments.
export async function GET() {
  const ctx = await getApiContext()
  if ("error" in ctx) return ctx.error
  const { supabase, profile } = ctx

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*, plan:plans(name, price_kes, interval)")
    .eq("organization_id", profile.organization_id)
    .maybeSingle()

  const { data: payments } = await supabase
    .from("subscription_payments")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })
    .limit(20)

  return NextResponse.json({
    subscription,
    payments: payments ?? [],
    paystackEnabled: paystackConfigured(),
  })
}
