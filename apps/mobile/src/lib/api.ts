import { apiFetch } from "./api-fetch"

// R3: JSON helpers over apiFetch for the online back-office screens. Every web
// route answers errors as `{ error: string }` (Zod's first issue, or a
// sentence written for people), so that's what we surface; a thrown fetch
// (no network, DNS, TLS) becomes one plain "can't reach the server" message.

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

export const NETWORK_ERROR = "Could not reach the server. Check your connection and try again."

interface JsonInit {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  body?: unknown
}

export async function apiJson<T>(path: string, init: JsonInit = {}): Promise<T> {
  let res: Response
  try {
    res = await apiFetch(path, {
      method: init.method ?? "GET",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new ApiError(0, NETWORK_ERROR)
  }
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  if (!res.ok) {
    const msg =
      json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string"
        ? (json as { error: string }).error
        : `Something went wrong (HTTP ${res.status})`
    throw new ApiError(res.status, msg, json)
  }
  return json as T
}

/** Message to show for anything thrown by apiJson (or elsewhere). */
export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  return "Something went wrong. Please try again."
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
