import { nairobiParts } from "./time"

// Small display helpers for sync UI (pure).

export function timeAgo(ms: number | null, now = Date.now()): string {
  if (ms == null) return "never"
  const diff = Math.max(0, now - ms)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "just now"
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? "" : "s"} ago`
}

/** "2h 05m" / "14m" until `ms` from now. */
export function countdown(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 60_000))
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`
}

/** Nairobi wall-clock "HH:MM". */
export function nairobiClock(ms: number): string {
  const p = nairobiParts(ms)
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`
}
