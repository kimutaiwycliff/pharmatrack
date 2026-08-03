import { getCookie } from "./auth-client"
import { env } from "./env"

// For business API routes (/api/products/search, /api/sales — not /api/auth/*,
// so Better Auth's origin-trust check doesn't apply here). Attaches the same
// session the expoClient keeps in SecureStore as a plain Cookie header, the
// mechanism @better-auth/expo's own client exposes getCookie() for.
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookie = getCookie()
  return fetch(`${env.EXPO_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(cookie ? { cookie } : {}),
      "Content-Type": "application/json",
    },
  })
}

// For multipart uploads (e.g. POST /api/uploads/product-image) — apiFetch()
// above unconditionally forces Content-Type: application/json, which breaks
// multipart bodies. React Native's fetch/FormData needs to set its own
// `multipart/form-data; boundary=...` header itself, so this variant attaches
// the same session cookie but leaves Content-Type unset entirely.
export async function apiFetchFormData(path: string, formData: FormData, init?: RequestInit): Promise<Response> {
  const cookie = getCookie()
  return fetch(`${env.EXPO_PUBLIC_API_URL}${path}`, {
    ...init,
    method: init?.method ?? "POST",
    body: formData,
    headers: {
      ...(init?.headers ?? {}),
      ...(cookie ? { cookie } : {}),
    },
  })
}
