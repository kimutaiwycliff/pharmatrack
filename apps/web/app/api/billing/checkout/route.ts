import { NextResponse } from "next/server"
import { getApiContext } from "@/lib/api-auth"
import { initializeTransaction, paystackConfigured } from "@/lib/billing/paystack"

// Owner starts (or renews) their subscription payment via Paystack.
export async function POST() {
  const ctx = await getApiContext({ roles: ["owner"] })
  if ("error" in ctx) return ctx.error
  const { supabase, profile } = ctx

  if (!paystackConfigured()) {
    return NextResponse.json({ error: "Online payment isn't enabled. Contact PharmaTrack." }, { status: 503 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const email = user?.email
  if (!email) return NextResponse.json({ error: "No email on file" }, { status: 400 })

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan:plans(name, price_kes, interval)")
    .eq("organization_id", profile.organization_id)
    .maybeSingle()
  const plan = sub?.plan as { name: string; price_kes: number; interval: string } | null
  if (!plan || !plan.price_kes) {
    return NextResponse.json({ error: "No plan price configured for your pharmacy" }, { status: 400 })
  }

  try {
    const { authorizationUrl } = await initializeTransaction({
      email,
      amountKes: Number(plan.price_kes),
      metadata: { organization_id: profile.organization_id, plan_name: plan.name, type: "subscription" },
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/settings`,
    })
    return NextResponse.json({ authorization_url: authorizationUrl })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Payment init failed" }, { status: 502 })
  }
}
