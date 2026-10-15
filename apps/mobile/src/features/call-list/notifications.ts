import { Platform } from "react-native"
import { kvGetSync, kvSetSync } from "../../lib/kv"
import { ensureNotificationPermission, loadNotifications } from "../../lib/sync/notifications"
import { callNotificationBody, planCallNotification, type CallList } from "./logic/callList"

// One local notification at 07:30 Nairobi: "N clients to call today…". Re-planned
// after every successful call-list fetch (logic/callList.ts planCallNotification
// has the timing rule); a stable identifier means a reschedule replaces it.
// Best-effort like the sync reminders: no module / no permission = no-op.

const CHANNEL_ID = "appointment-calls"
const NOTIFICATION_ID = "appointment-calls-morning"
const STATE_KEY = "appointment_call_reminder"

export async function updateCallReminder(list: CallList, now = Date.now()): Promise<void> {
  try {
    const plan = planCallNotification(list, now)
    const key = plan ? `${plan.at}:${plan.count}` : "none"
    if (kvGetSync<string>(STATE_KEY) === key) return
    const n = await loadNotifications()
    if (!n) return
    await n.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {})
    if (plan && (await ensureNotificationPermission(n))) {
      if (Platform.OS === "android") {
        await n.setNotificationChannelAsync(CHANNEL_ID, { name: "Clients to call", importance: n.AndroidImportance.HIGH })
      }
      await n.scheduleNotificationAsync({
        identifier: NOTIFICATION_ID,
        content: { title: "Clients to call", body: callNotificationBody(plan.count), data: { url: "/dashboard" } },
        trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: new Date(plan.at), channelId: CHANNEL_ID },
      })
    }
    kvSetSync(STATE_KEY, plan ? key : "none")
  } catch {
    // A convenience only; the dashboard card still lists everyone.
  }
}
