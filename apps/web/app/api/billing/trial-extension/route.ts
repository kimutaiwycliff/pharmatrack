import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getApiContext } from "@/lib/api-auth"
import { getSession } from "@/lib/auth/helpers"
import { rateLimit } from "@/lib/rate-limit"
import { createTrialExtensionRequest, MAX_EXTENSION_MESSAGE, trialExtensionStatus } from "@/lib/trials/extension"

// Owner asks the operator for a free trial (or more trial time) when the
// pharmacy has no trial and hasn't paid — e.g. it was created without one
// because a previous trial matched. Must keep working while locked out (it's
// shown on the SubscriptionGate screen), hence allowInactiveSubscription.
// One pending request at a time; the operator is emailed.

const schema = z.object({
  message: z.string().trim().max(MAX_EXTENSION_MESSAGE, "Please keep the message under 1,000 characters").optional(),
})

export async function GET() {
  const ctx = await getApiContext({ permission: "billing.manage", allowInactiveSubscription: true })
  if ("error" in ctx) return ctx.error
  return NextResponse.json(await trialExtensionStatus(ctx.organizationId))
}

export async function POST(request: NextRequest) {
  const ctx = await getApiContext({ permission: "billing.manage", allowInactiveSubscription: true })
  if ("error" in ctx) return ctx.error

  const rl = await rateLimit(`trial-ext:org:${ctx.organizationId}`, 3, 86_400)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "You've sent several requests today. We'll be in touch — please try again tomorrow." },
      { status: 429, headers: { "retry-after": String(Math.max(1, rl.retryAfter)) } },
    )
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  const status = await trialExtensionStatus(ctx.organizationId)
  if (status.pending) return NextResponse.json({ error: "You already have a trial request waiting for review." }, { status: 409 })
  if (!status.eligible) {
    return NextResponse.json({ error: "Your pharmacy already has an active trial or subscription." }, { status: 400 })
  }

  const session = await getSession()
  const email = session?.user?.email
  if (!email) return NextResponse.json({ error: "No email on file" }, { status: 400 })

  const result = await createTrialExtensionRequest({
    tenant: ctx, organizationId: ctx.organizationId, userId: ctx.userId, email, message: parsed.data.message,
  })
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 })
  return NextResponse.json({ ok: true, id: result.request.id }, { status: 201 })
}
