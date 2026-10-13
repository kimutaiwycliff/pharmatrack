import { apiFetch, REQUEST_TIMEOUT_MS } from "./api-fetch"
import { httpMessage, NETWORK_ERROR, TIMEOUT_ERROR, userMessage, withTimeout } from "./errors"

// R3: JSON helpers over apiFetch for the online back-office screens. Every web
// route answers errors as `{ error: string }` (Zod's first issue, or a
// sentence written for people), so that's what we surface; a thrown fetch
// (no network, DNS, TLS) becomes one plain "can't reach the server" message,
// a slow one a "taking too long" message (lib/errors.ts has the wording).

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The parsed error body, for routes that return extra fields (e.g. 409 impact details). */
    public body: unknown = null,
  ) {
    super(message)
  }
}

export { NETWORK_ERROR }

interface JsonInit {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  body?: unknown
  /** Extra headers, e.g. an Idempotency-Key (lib/useIdempotencyKey.ts). */
  headers?: Record<string, string>
}

export async function apiJson<T>(path: string, init: JsonInit = {}): Promise<T> {
  let res: Response
  try {
    res = await apiFetch(path, {
      method: init.method ?? "GET",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      headers: init.headers,
    })
  } catch (err) {
    throw new ApiError(0, err instanceof Error && err.name === "TimeoutError" ? TIMEOUT_ERROR : NETWORK_ERROR)
  }
  let json: unknown = null
  try {
    json = await withTimeout(res.json() as Promise<unknown>, REQUEST_TIMEOUT_MS)
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") throw new ApiError(0, TIMEOUT_ERROR)
    json = null
  }
  if (!res.ok) {
    const serverText =
      json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string"
        ? (json as { error: string }).error
        : null
    throw new ApiError(res.status, httpMessage(res.status, serverText), json)
  }
  return json as T
}

/**
 * Message to show for anything thrown by apiJson (or elsewhere). Raw technical
 * text (SQLite errors, "Network request failed", HTTP codes) never reaches the
 * user — see lib/errors.ts. The original is logged in development.
 */
export function errorMessage(err: unknown, fallback?: string): string {
  if (__DEV__ && !(err instanceof ApiError)) console.warn("[errorMessage]", err)
  return userMessage(err, fallback)
}

/** Builds `path?a=1&b=2`, skipping undefined/null/"" values. */
export function withQuery(path: string, params: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue
    q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `${path}?${s}` : path
}
