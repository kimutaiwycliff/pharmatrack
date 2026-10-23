// Device-authenticated requests to /api/sync/* (`Authorization: Device <token>`,
// lib/sync/device-auth.ts). Errors are classified so the engine can tell
// "offline, try later" from "re-register" from "renew the subscription".
// Same origin as the page, so it works in a browser and in the desktop app.

export const NETWORK_MESSAGE = "Can't reach PharmaTrack — check the internet connection."
export const TIMEOUT_MESSAGE = "PharmaTrack is taking too long to answer. We'll try again shortly."

export class NetworkError extends Error {
  constructor(message: string = NETWORK_MESSAGE, cause?: unknown) {
    super(message, { cause })
    this.name = "NetworkError"
  }
}

export class SyncHttpError extends Error {
  constructor(
    public status: number,
    public code: string | null,
    message: string,
    public retryAfter: number | null = null,
  ) {
    super(message)
    this.name = "SyncHttpError"
  }
  get revoked() {
    return this.status === 401
  }
  get subscriptionInactive() {
    return this.status === 402
  }
}

/** Readable text for an HTTP failure when the server didn't send its own. */
export function httpMessage(status: number, serverText?: string | null): string {
  if (serverText) return serverText
  if (status === 429) return "Too many requests — waiting a moment before trying again."
  if (status >= 500) return "PharmaTrack had a problem on its side. We'll try again shortly."
  if (status === 403) return "You don't have permission to do that."
  return `Request failed (${status})`
}

const TIMEOUT_MS = 30_000

export async function deviceFetch<T>(token: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, TIMEOUT_MS)
  let res: Response
  let body: (T & { error?: string; message?: string; code?: string }) | null
  try {
    res = await fetch(path, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Device ${token}`, "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      cache: "no-store",
    })
    // Reading the body shares the same timeout: a stalled download mustn't hang a sync.
    body = (await res.json().catch(() => null)) as typeof body
  } catch (err) {
    throw new NetworkError(timedOut ? TIMEOUT_MESSAGE : NETWORK_MESSAGE, err)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const retry = Number(res.headers.get("retry-after"))
    // Rate-limit answers carry their text in `message` (lib/rate-limit.ts).
    throw new SyncHttpError(res.status, body?.code ?? null, httpMessage(res.status, body?.message ?? body?.error), Number.isFinite(retry) && retry > 0 ? retry : null)
  }
  if (body == null) throw new SyncHttpError(res.status, "bad_body", "PharmaTrack sent an unreadable answer. We'll try again shortly.")
  return body
}
