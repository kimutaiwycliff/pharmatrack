// The notification bell's alerts are live (low stock, expiring batches,
// devices waiting…), so they can't be deleted — but each person can mark them
// seen, dismiss them or snooze them (notification_state, migration 044). Each
// alert has a stable key and a fingerprint of its current version; when the
// fingerprint changes (stock runs out, another device asks) it's new again.

export interface BellAlert {
  /** Stable name, e.g. "low:<product id>", "devices". */
  key: string
  /** The alert's current version, e.g. "out", "3". */
  fp: string
}

export interface AlertState {
  seen_fp: string | null
  dismissed_fp: string | null
  dismissed_until: Date | string | null
}

export type AlertStatus = "new" | "seen" | "hidden"

/** Hidden while snoozed or dismissed (until it changes); else new or seen. */
export function alertStatus(alert: BellAlert, state: AlertState | undefined, now: number = Date.now()): AlertStatus {
  if (!state) return "new"
  if (state.dismissed_until && new Date(state.dismissed_until).getTime() > now) return "hidden"
  if (state.dismissed_fp !== null && state.dismissed_fp === alert.fp && !state.dismissed_until) return "hidden"
  return state.seen_fp === alert.fp ? "seen" : "new"
}

export type BellAction = "seen" | "dismiss" | "snooze_day" | "snooze_week" | "restore"

/** What an action writes (only Dates — never strings — for the snooze end). */
export interface StateWrite { seen_fp?: string; dismissed_fp?: string | null; dismissed_until?: Date | null }

export function stateFor(action: BellAction, alert: BellAlert, now: Date = new Date()): StateWrite {
  switch (action) {
    case "seen": return { seen_fp: alert.fp }
    case "dismiss": return { seen_fp: alert.fp, dismissed_fp: alert.fp, dismissed_until: null }
    case "snooze_day": return { seen_fp: alert.fp, dismissed_fp: null, dismissed_until: new Date(now.getTime() + 86_400_000) }
    case "snooze_week": return { seen_fp: alert.fp, dismissed_fp: null, dismissed_until: new Date(now.getTime() + 7 * 86_400_000) }
    case "restore": return { dismissed_fp: null, dismissed_until: null }
  }
}
