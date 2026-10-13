import { env } from "../env"
import { httpMessage, NETWORK_ERROR, TIMEOUT_ERROR, withTimeout } from "../errors"

// Device-authenticated requests to /api/sync/* (`Authorization: Device <token>`,
// apps/web/lib/sync/device-auth.ts). Errors are classified so the engine can
// tell "offline, try later" from "re-register" from "renew subscription".

// `message` is always readable (lib/errors.ts wording); `cause` keeps the
// original text ("Network request failed", "Aborted") for logs.
export class NetworkError extends Error {
  constructor(message: string = NETWORK_ERROR, cause?: unknown) {
    super(message, { cause })
    this.name = "NetworkError"
  }
}

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
  if (!env.EXPO_PUBLIC_API_URL) throw new NetworkError(NETWORK_ERROR, "No API URL configured")
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${env.EXPO_PUBLIC_API_URL}${path}`, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Device ${token}`, "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    })
  } catch (err) {
    throw new NetworkError(timedOut ? TIMEOUT_ERROR : NETWORK_ERROR, err)
  } finally {
    clearTimeout(timer)
  }
  // Reading the body is limited too: a stalled download mustn't hang the sync.
  let body: (T & { error?: string; code?: string }) | null
  try {
    body = (await withTimeout((res.json() as Promise<unknown>).catch(() => null), TIMEOUT_MS)) as typeof body
  } catch (err) {
    throw new NetworkError(TIMEOUT_ERROR, err)
  }
  if (!res.ok) {
    throw new SyncHttpError(res.status, body?.code ?? null, httpMessage(res.status, body?.error))
  }
  if (body == null) throw new SyncHttpError(res.status, "bad_body", "The server sent an unreadable answer")
  return body
}
