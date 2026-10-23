import { HOUR_MS } from "./time"

// Selling lock state machine (R1 rule 3 + 4). Pure: the caller passes the
// clock it trusts (the server-anchored estimate, see clock.ts) and everything
// it knows; this decides whether the till may sell right now.
//
//   never synced ─────────────► locked ("never_synced")
//   synced, now < deadline ───► selling (banner from 21:00)
//   now ≥ deadline, no sync ──► locked ("deadline"), manager override offered
//                               until 12:00 (deadline + 12h, the server's
//                               reservation grace window)
//   override used ────────────► selling until override.until (12:00)
//   after 12:00 ──────────────► locked ("override_expired") — no second
//                               override for the same deadline
//   clock moved back > 5 min ─► locked ("clock_changed") until a sync
//
// A successful sync replaces `deadline` with the next midnight, which is what
// clears every deadline-based lock.

export const OVERRIDE_GRACE_MS = 12 * HOUR_MS
/** Deadline is Nairobi midnight, so 3h before it is 21:00. */
export const WARN_BEFORE_DEADLINE_MS = 3 * HOUR_MS

export type LockReason = "unregistered" | "revoked" | "clock_changed" | "never_synced" | "deadline" | "override_expired"

export interface OverrideRecord {
  client_id: string
  manager_id: string
  manager_name: string
  /** epoch ms */
  at: number
  /** epoch ms — selling allowed until this instant */
  until: number
  /** the deadline (epoch ms) this override was granted against */
  deadline: number
}

export interface LockInput {
  now: number
  registered: boolean
  revoked: boolean
  clockTampered: boolean
  /** epoch ms of the current sync deadline, null if the device never synced */
  deadline: number | null
  override: OverrideRecord | null
}

export interface LockState {
  locked: boolean
  reason: LockReason | null
  /** selling right now only because of a manager override */
  underOverride: boolean
  /** a manager may unlock with their PIN right now */
  overrideAvailable: boolean
  /** when an override granted now (or the active one) would end */
  overrideUntil: number | null
  /** show the "sync before midnight" warning */
  warnDeadline: boolean
  msToDeadline: number | null
}

const base: LockState = {
  locked: false,
  reason: null,
  underOverride: false,
  overrideAvailable: false,
  overrideUntil: null,
  warnDeadline: false,
  msToDeadline: null,
}

/** Override window for a missed deadline: until 12:00 the same (Nairobi) day. */
export function overrideUntilFor(deadline: number): number {
  return deadline + OVERRIDE_GRACE_MS
}

export function computeLock(i: LockInput): LockState {
  if (!i.registered) return { ...base, locked: true, reason: "unregistered" }
  if (i.revoked) return { ...base, locked: true, reason: "revoked" }
  if (i.clockTampered) return { ...base, locked: true, reason: "clock_changed" }
  if (i.deadline == null) return { ...base, locked: true, reason: "never_synced" }

  const msToDeadline = i.deadline - i.now
  if (msToDeadline > 0) {
    return { ...base, msToDeadline, warnDeadline: msToDeadline <= WARN_BEFORE_DEADLINE_MS }
  }

  const graceEnd = overrideUntilFor(i.deadline)
  const ov = i.override && i.override.deadline === i.deadline ? i.override : null
  if (ov) {
    if (i.now < ov.until) {
      return { ...base, msToDeadline, underOverride: true, overrideUntil: ov.until }
    }
    return { ...base, locked: true, reason: "override_expired", msToDeadline }
  }
  const available = i.now < graceEnd
  return {
    ...base,
    locked: true,
    reason: "deadline",
    msToDeadline,
    overrideAvailable: available,
    overrideUntil: available ? graceEnd : null,
  }
}

/** Human copy for each lock reason (shared by the lock screen + sync screen). */
export function lockMessage(reason: LockReason, device = "phone"): string {
  const Device = device.charAt(0).toUpperCase() + device.slice(1)
  switch (reason) {
    case "unregistered":
      return `Ask a manager to register this ${device}`
    case "revoked":
      return `This ${device} was removed from the pharmacy. A manager must register it again.`
    case "clock_changed":
      return `${Device} clock was changed — connect to sync`
    case "never_synced":
      return "Connect to the internet and sync once to start selling"
    case "deadline":
      return "Yesterday's sales were not synced before midnight. Connect to sync, or ask a manager to unlock until 12:00."
    case "override_expired":
      return "The manager unlock ended at 12:00. Connect to the internet and sync to keep selling."
  }
}
