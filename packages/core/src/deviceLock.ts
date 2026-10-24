// ─────────────────────────────────────────────────────────────────────────────
// Approved devices only (ADR-018) — the pure rules, shared by the web server,
// the web UI and the Android app.
//
// Off by default. When on, staff can sign in only on devices the owner (or a
// manager with "Manage selling devices") approved. The owner is never locked,
// so a pharmacy can't shut itself out.
// ─────────────────────────────────────────────────────────────────────────────

export interface DeviceLockSettings {
  enabled: boolean
  /** Let managers sign in anywhere (e.g. reports from home). */
  managers_exempt: boolean
}

export const DEFAULT_DEVICE_LOCK: DeviceLockSettings = { enabled: false, managers_exempt: false }

/** Read the lock from org_settings.settings (any shape, never throws). */
export function deviceLockFrom(settings: unknown): DeviceLockSettings {
  const raw = settings && typeof settings === "object" ? (settings as Record<string, unknown>).device_lock : null
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DEVICE_LOCK }
  const r = raw as Record<string, unknown>
  return { enabled: r.enabled === true, managers_exempt: r.managers_exempt === true }
}

/** Does the lock stop this role signing in on an unapproved device? */
export function deviceLockApplies(lock: DeviceLockSettings, role: string | null | undefined): boolean {
  if (!lock.enabled || !role) return false
  if (role === "owner") return false
  if (role === "manager" && lock.managers_exempt) return false
  return true
}

/** Roles the lock applies to, for the settings summary. */
export function lockedRoles(lock: DeviceLockSettings): string[] {
  return ["manager", "pharmacist", "cashier"].filter((r) => deviceLockApplies({ ...lock, enabled: true }, r))
}

export type DevicePurpose = "till" | "office"

export const DEVICE_PURPOSES: Record<DevicePurpose, { label: string; description: string }> = {
  till: { label: "Selling till", description: "Sells at the till, works offline and holds a share of the branch's stock." },
  office: { label: "Back office", description: "For signing in to manage stock, reports and settings — doesn't sell offline or hold stock." },
}

/** How long a device has to be approved after a blocked sign-in. */
export const DEVICE_REQUEST_TTL_MIN = 15

/** "482913" → "482 913" — easier to read out and compare. */
export function formatPairingCode(code: string): string {
  return /^\d{6}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code
}

/** A friendly default name from a user agent: "Chrome on Windows", "Android phone"… */
export function deviceNameFromUserAgent(ua: string | null | undefined, platform?: string | null): string {
  if (platform === "android") return "Android phone"
  if (platform === "desktop") return "PharmaTrack desktop app"
  const s = ua ?? ""
  const os = /Windows/i.test(s) ? "Windows" : /Android/i.test(s) ? "Android" : /iPhone|iPad|iOS/i.test(s) ? "iPhone/iPad"
    : /Mac OS X|Macintosh/i.test(s) ? "Mac" : /Linux/i.test(s) ? "Linux" : null
  const browser = /Edg\//i.test(s) ? "Edge" : /OPR\/|Opera/i.test(s) ? "Opera" : /Firefox\//i.test(s) ? "Firefox"
    : /Chrome\//i.test(s) ? "Chrome" : /Safari\//i.test(s) ? "Safari" : null
  if (browser && os) return `${browser} on ${os}`
  return browser ?? os ?? "This device"
}

/** First Android JS bundle (APP_BUNDLE_VERSION, shipped over the air) that
 *  sends its device key at sign-in. Older apps are blocked while the lock is
 *  on (ADR-018), so the settings warn. */
export const ANDROID_DEVICE_LOCK_MIN_VERSION = "1.3.1"

/** -1 / 0 / 1 for dotted numeric versions ("1.10.0" > "1.9.2"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((x) => parseInt(x, 10) || 0)
  const pb = b.split(/[.+-]/).map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}
