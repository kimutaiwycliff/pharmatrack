import { Platform } from "react-native"
import { kvGetSync, kvSetSync } from "../kv"
import { nairobiAt } from "./core/time"

// R1 rule 3 — local reminders at 22:00 and 23:30 (Nairobi) while sales are
// still waiting to upload before the midnight deadline. Entirely optional:
// the module is loaded lazily and every call is wrapped, so a dev client built
// without expo-notifications, or a user who denied permission, just gets the
// in-app banner instead of a crash.

type NotificationsModule = typeof import("expo-notifications")

const STATE_KEY = "sync_reminders"
const CHANNEL_ID = "sync-deadline"

interface ReminderState {
  key: string
  ids: string[]
}

let mod: NotificationsModule | null | undefined
let permissionAsked = false

/** expo-notifications, or null when the build doesn't include it. Shared with features/call-list. */
export async function loadNotifications(): Promise<NotificationsModule | null> {
  if (mod !== undefined) return mod
  try {
    mod = await import("expo-notifications")
  } catch {
    mod = null
  }
  return mod
}

/** Asks at most once per app run; false when denied or unavailable. */
export async function ensureNotificationPermission(n: NotificationsModule): Promise<boolean> {
  try {
    const current = await n.getPermissionsAsync()
    if (current.granted) return true
    if (permissionAsked || !current.canAskAgain) return false
    permissionAsked = true
    return (await n.requestPermissionsAsync()).granted
  } catch {
    return false
  }
}

/**
 * Keep exactly the right reminders scheduled for `deadline`: two when sales
 * are pending, none otherwise. Cheap to call often — it only touches the OS
 * scheduler when the (deadline, pending) key changes.
 */
export async function updateDeadlineReminders(pendingSales: number, deadline: number | null, now = Date.now()): Promise<void> {
  try {
    const key = pendingSales > 0 && deadline ? `${deadline}:${pendingSales}` : "none"
    const prev = kvGetSync<ReminderState>(STATE_KEY)
    if (prev?.key === key) return
    const n = await loadNotifications()
    if (!n) return
    for (const id of prev?.ids ?? []) await n.cancelScheduledNotificationAsync(id).catch(() => {})
    const ids: string[] = []
    if (key !== "none" && deadline && (await ensureNotificationPermission(n))) {
      if (Platform.OS === "android") {
        await n.setNotificationChannelAsync(CHANNEL_ID, { name: "Sync reminders", importance: n.AndroidImportance.HIGH })
      }
      // The day before the deadline (deadline − 1 ms lands on that evening).
      for (const [h, m] of [[22, 0], [23, 30]] as const) {
        const at = nairobiAt(deadline - 1, h, m)
        if (at <= now) continue
        ids.push(await n.scheduleNotificationAsync({
          content: {
            title: "Sync before midnight",
            body: `${pendingSales} sale${pendingSales === 1 ? "" : "s"} waiting to upload. Connect to the internet and open PharmaTrack.`,
          },
          trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: CHANNEL_ID },
        }))
      }
    }
    kvSetSync(STATE_KEY, { key, ids })
  } catch {
    // Reminders are a convenience; the in-app banner still shows.
  }
}
