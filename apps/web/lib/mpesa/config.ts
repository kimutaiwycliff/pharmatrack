import "server-only"
import { eq } from "drizzle-orm"
import { dbAdmin, mpesa_config } from "@pharmatrack/db"
import { hasFeature } from "@pharmatrack/core"
import { decryptSecret } from "@/lib/crypto"
import { planCodeForOrg } from "@/lib/entitlements"

export interface MpesaConfig {
  environment: "sandbox" | "production"
  shortcode: string | null
  shortcode_type: "buygoods" | "paybill"
  consumer_key: string | null
  consumer_secret: string | null // decrypted
  passkey: string | null // decrypted
  active: boolean
  verified_at: Date | null
}

/** Load a tenant's M-Pesa config with secrets decrypted (server-only). */
export async function getMpesaConfig(orgId: string): Promise<MpesaConfig | null> {
  const [row] = await dbAdmin().select().from(mpesa_config).where(eq(mpesa_config.organization_id, orgId)).limit(1)
  if (!row) return null
  return {
    environment: (row.environment as MpesaConfig["environment"]) ?? "sandbox",
    shortcode: row.shortcode,
    shortcode_type: (row.shortcode_type as MpesaConfig["shortcode_type"]) ?? "buygoods",
    consumer_key: row.consumer_key,
    consumer_secret: decryptSecret(row.consumer_secret_enc),
    passkey: decryptSecret(row.passkey_enc),
    active: row.active,
    verified_at: row.verified_at,
  }
}

/** True once every credential needed for an STK push is present. */
export function isConfigured(c: MpesaConfig | null): boolean {
  return !!(c && c.shortcode && c.consumer_key && c.consumer_secret && c.passkey)
}

/** STK prompting is available only when the plan includes it (Growth+) AND the
 *  tenant has switched on a complete config. Otherwise the till uses manual
 *  confirm. Returns the reason so callers/UI can explain it. */
export async function mpesaStkAvailability(orgId: string): Promise<{
  available: boolean
  planAllowed: boolean
  configured: boolean
}> {
  const planCode = await planCodeForOrg(orgId)
  const planAllowed = hasFeature(planCode, "mpesa_stk")
  const cfg = await getMpesaConfig(orgId)
  const configured = !!(cfg?.active && isConfigured(cfg))
  return { available: planAllowed && configured, planAllowed, configured }
}
