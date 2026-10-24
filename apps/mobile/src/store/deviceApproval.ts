import { create } from "zustand"

// A sign-in the server refused because the pharmacy only allows approved
// devices (ADR-018). Login puts the request here and opens /device-approval;
// that screen calls `retry` (the same sign-in again) once this phone is
// approved. Memory only — the request secret never touches storage until it
// becomes the device key.

export interface DeviceRequestInfo { id: string; code: string; secret: string; expires_at: string }

interface DeviceApprovalState {
  request: DeviceRequestInfo | null
  retry: (() => Promise<void>) | null
  start: (request: DeviceRequestInfo, retry: () => Promise<void>) => void
  clear: () => void
}

export const useDeviceApprovalStore = create<DeviceApprovalState>()((set) => ({
  request: null,
  retry: null,
  start: (request, retry) => set({ request, retry }),
  clear: () => set({ request: null, retry: null }),
}))

/** The approval request inside a refused sign-in's error body, if that's why it was refused. */
export function deviceRequestFrom(err: unknown): DeviceRequestInfo | null {
  type Body = { code?: string; request?: DeviceRequestInfo; error?: Body; body?: Body } | null | undefined
  const e = err as Body
  // better-fetch spreads the JSON body into the error; look one level down too.
  for (const b of [e, e?.error, e?.body]) {
    if (b?.code === "DEVICE_NOT_APPROVED" && b.request?.secret) return b.request
  }
  return null
}
