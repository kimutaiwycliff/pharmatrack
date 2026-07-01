import "server-only"
import type { MpesaConfig } from "./config"

export function darajaBase(env: string): string {
  return env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke"
}

export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "")
  if (d.startsWith("0") && d.length === 10) return "254" + d.slice(1)
  if (d.startsWith("254")) return d
  if (d.length === 9) return "254" + d
  return d
}

function stamp(): string {
  return new Date().toISOString().replace(/[-T:Z.]/g, "").slice(0, 14)
}

/** OAuth token — also serves as a "test connection" check (validates key/secret). */
export async function getDarajaToken(c: { environment: string; consumer_key: string | null; consumer_secret: string | null }): Promise<string> {
  if (!c.consumer_key || !c.consumer_secret) throw new Error("Consumer key / secret missing")
  const creds = Buffer.from(`${c.consumer_key}:${c.consumer_secret}`).toString("base64")
  const res = await fetch(`${darajaBase(c.environment)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  })
  if (!res.ok) throw new Error(`Daraja auth failed (HTTP ${res.status}). Check the consumer key/secret and environment.`)
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error("Daraja returned no access token")
  return json.access_token
}

/** Fire an STK push using the tenant's own credentials. */
export async function stkPush(
  cfg: MpesaConfig,
  p: { phone: string; amount: number; accountRef: string; callbackUrl: string },
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  if (!cfg.shortcode || !cfg.passkey) throw new Error("Shortcode / passkey missing")
  const token = await getDarajaToken(cfg)
  const ts = stamp()
  const password = Buffer.from(`${cfg.shortcode}${cfg.passkey}${ts}`).toString("base64")
  const phone = formatPhone(p.phone)
  const res = await fetch(`${darajaBase(cfg.environment)}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: cfg.shortcode,
      Password: password,
      Timestamp: ts,
      TransactionType: cfg.shortcode_type === "paybill" ? "CustomerPayBillOnline" : "CustomerBuyGoodsOnline",
      Amount: Math.ceil(p.amount),
      PartyA: phone,
      PartyB: cfg.shortcode,
      PhoneNumber: phone,
      CallBackURL: p.callbackUrl,
      AccountReference: p.accountRef.slice(0, 12),
      TransactionDesc: "PharmaTrack Sale",
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: res.ok, status: res.status, data }
}
