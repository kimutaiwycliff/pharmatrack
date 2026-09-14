import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { dbAdmin, mpesa_config } from "@pharmatrack/db"
import { hasFeature } from "@pharmatrack/core"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { encryptSecret } from "@/lib/crypto"
import { getMpesaConfig, isConfigured } from "@/lib/mpesa/config"
import { planCodeForOrg } from "@/lib/entitlements"

// Owner-managed M-Pesa Daraja config. Secrets are write-only (never returned).
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (ctx.role !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 })

  const cfg = await getMpesaConfig(ctx.organizationId)
  const planAllowed = hasFeature(await planCodeForOrg(ctx.organizationId), "mpesa_stk")
  return NextResponse.json({
    config: cfg && {
      environment: cfg.environment, shortcode: cfg.shortcode, shortcode_type: cfg.shortcode_type,
      consumer_key: cfg.consumer_key, active: cfg.active, verified_at: cfg.verified_at,
      has_secret: !!cfg.consumer_secret, has_passkey: !!cfg.passkey,
    },
    planAllowed,
    configured: !!(cfg && isConfigured(cfg)),
  })
}

const schema = z.object({
  environment: z.enum(["sandbox", "production"]),
  shortcode: z.string().trim().max(12).optional().or(z.literal("")),
  shortcode_type: z.enum(["buygoods", "paybill"]),
  consumer_key: z.string().trim().max(200).optional().or(z.literal("")),
  consumer_secret: z.string().trim().max(200).optional(), // only set if provided
  passkey: z.string().trim().max(200).optional(),          // only set if provided
  active: z.boolean(),
})

export async function PUT(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (ctx.role !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  const d = parsed.data
  const db = dbAdmin()

  // Secrets are only rewritten when a new value is supplied (blank = keep existing).
  const secretEnc = d.consumer_secret ? encryptSecret(d.consumer_secret) : undefined
  const passkeyEnc = d.passkey ? encryptSecret(d.passkey) : undefined

  await db.insert(mpesa_config).values({
    organization_id: ctx.organizationId,
    environment: d.environment,
    shortcode: d.shortcode || null,
    shortcode_type: d.shortcode_type,
    consumer_key: d.consumer_key || null,
    consumer_secret_enc: secretEnc ?? null,
    passkey_enc: passkeyEnc ?? null,
    active: d.active,
    updated_at: new Date(),
  }).onConflictDoUpdate({
    target: mpesa_config.organization_id,
    set: {
      environment: d.environment,
      shortcode: d.shortcode || null,
      shortcode_type: d.shortcode_type,
      consumer_key: d.consumer_key || null,
      ...(secretEnc !== undefined ? { consumer_secret_enc: secretEnc } : {}),
      ...(passkeyEnc !== undefined ? { passkey_enc: passkeyEnc } : {}),
      active: d.active,
      // Changing config invalidates a prior verification.
      ...(secretEnc !== undefined || passkeyEnc !== undefined ? { verified_at: null } : {}),
      updated_at: new Date(),
    },
  })

  const cfg = await getMpesaConfig(ctx.organizationId)
  return NextResponse.json({ ok: true, configured: !!(cfg && isConfigured(cfg)) })
}
