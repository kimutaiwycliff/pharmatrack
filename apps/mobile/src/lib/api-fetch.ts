import { getCookie } from "./auth-client"
import { env } from "./env"
import { TimeoutError, UserFacingError } from "./errors"
import { readDeviceToken } from "./sync/device-key"

// Every request has a time limit, so a button never spins forever on a weak
// connection. The limit covers getting the response headers; apiJson() also
// limits reading the body.
export const REQUEST_TIMEOUT_MS = 20_000
export const UPLOAD_TIMEOUT_MS = 60_000
const OFFLINE_BUILD = "This needs the online version of PharmaTrack."

async function timedFetch(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (timedOut) throw new TimeoutError()
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// For business API routes (/api/products/search, /api/sales — not /api/auth/*,
// so Better Auth's origin-trust check doesn't apply here). Attaches the same
// session the expoClient keeps in SecureStore as a plain Cookie header, the
// mechanism @better-auth/expo's own client exposes getCookie() for.
// Approved devices only (ADR-018): every call carries this phone's device key,
// so the server can check each request — not just the sign-in — comes from
// the approved till its session started on.
async function deviceHeaders(): Promise<Record<string, string>> {
  const token = await readDeviceToken().catch(() => null)
  return token ? { "x-pt-device": token, "x-pt-platform": "android" } : { "x-pt-platform": "android" }
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  // ADR-014: the Offline Edition build has no EXPO_PUBLIC_API_URL at all —
  // fail loudly here rather than silently fetching "undefined/api/...", so a
  // screen not yet ported to the local repo layer is caught immediately
  // instead of surfacing as a confusing network error.
  if (!env.EXPO_PUBLIC_API_URL) {
    if (__DEV__) console.warn(`apiFetch(${path}) called in an offline build with no API URL configured`)
    throw new UserFacingError(OFFLINE_BUILD)
  }
  const cookie = getCookie()
  const device = await deviceHeaders()
  return timedFetch(
    `${env.EXPO_PUBLIC_API_URL}${path}`,
    {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        ...device,
        ...(cookie ? { cookie } : {}),
        "Content-Type": "application/json",
      },
    },
    REQUEST_TIMEOUT_MS,
  )
}

// For multipart uploads (e.g. POST /api/uploads/product-image) — apiFetch()
// above unconditionally forces Content-Type: application/json, which breaks
// multipart bodies. React Native's fetch/FormData needs to set its own
// `multipart/form-data; boundary=...` header itself, so this variant attaches
// the same session cookie but leaves Content-Type unset entirely.
export async function apiFetchFormData(path: string, formData: FormData, init?: RequestInit): Promise<Response> {
  if (!env.EXPO_PUBLIC_API_URL) {
    if (__DEV__) console.warn(`apiFetchFormData(${path}) called in an offline build with no API URL configured`)
    throw new UserFacingError(OFFLINE_BUILD)
  }
  const cookie = getCookie()
  const device = await deviceHeaders()
  return timedFetch(
    `${env.EXPO_PUBLIC_API_URL}${path}`,
    {
      ...init,
      method: init?.method ?? "POST",
      body: formData,
      headers: {
        ...(init?.headers ?? {}),
        ...device,
        ...(cookie ? { cookie } : {}),
      },
    },
    UPLOAD_TIMEOUT_MS,
  )
}
