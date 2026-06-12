/**
 * Client-side JSON helpers that surface the server's `{ error }` message as a
 * thrown Error, so callers can `toast.error(err.message)` and show the real
 * reason instead of a generic "request failed".
 */

async function parse<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new Error(json?.error || `Request failed (${res.status})`)
  }
  return json
}

export async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return parse<T>(res)
}

export async function getJson<T = unknown>(url: string): Promise<T> {
  return parse<T>(await fetch(url))
}
