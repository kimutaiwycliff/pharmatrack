import { env } from "../env"

// Device-authenticated requests to /api/sync/* (`Authorization: Device <token>`,
// apps/web/lib/sync/device-auth.ts). Errors are classified so the engine can
// tell "offline, try later" from "re-register" from "renew subscription".

export class NetworkError extends Error {}

export class SyncHttpError extends Error {
  constructor(
    public status: number,
    public code: string | null,
    message: string,
  ) {
    super(message)
  }
  get revoked() {
    return this.status === 401
  }
  get subscriptionInactive() {
    return this.status === 402
  }
}

const TIMEOUT_MS = 30_000

export async function deviceFetch<T>(token: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  if (!env.EXPO_PUBLIC_API_URL) throw new NetworkError("No API URL configured")
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${env.EXPO_PUBLIC_API_URL}${path}`, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Device ${token}`, "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    })
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : String(err))
  } finally {
    clearTimeout(timer)
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null
  if (!res.ok) {
    throw new SyncHttpError(res.status, body?.code ?? null, body?.error ?? `HTTP ${res.status}`)
  }
  if (body == null) throw new SyncHttpError(res.status, "bad_body", "The server sent an unreadable answer")
  return body
}
