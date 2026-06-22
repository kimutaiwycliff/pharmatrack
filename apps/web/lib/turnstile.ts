// Cloudflare Turnstile verification for custom routes (the Better Auth captcha
// plugin only covers Better Auth endpoints). No-ops when unconfigured so local
// dev runs without keys.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export function turnstileConfigured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY
}

/** True if the token is valid — or if Turnstile isn't configured (skipped). */
export async function verifyTurnstile(token: string | null, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true // not enforced unless configured
  if (!token) return false
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip && ip !== "unknown") body.set("remoteip", ip)
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(8000) })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}
