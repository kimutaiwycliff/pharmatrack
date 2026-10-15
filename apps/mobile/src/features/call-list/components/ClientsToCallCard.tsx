import Ionicons from "@expo/vector-icons/Ionicons"
import { hasFeature } from "@pharmatrack/core"
import { router } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { Linking, StyleSheet, View } from "react-native"
import { Button, Card, Chip, PressableScale, Text } from "../../../components"
import { useCan } from "../../../hooks/useCan"
import { useQuery } from "../../../hooks/useQuery"
import { errorMessage } from "../../../lib/api"
import { formatTime } from "../../../lib/dates"
import { env } from "../../../lib/env"
import { haptics } from "../../../lib/haptics"
import { toast } from "../../../lib/toast"
import { useSessionStore } from "../../../store/session"
import { useTheme } from "../../../theme/useTheme"
import { radius, space, TOUCH_TARGET } from "../../../theme/tokens"
import { callListPath, fetchCallList, recordCallAction } from "../data"
import {
  actionToast, applyAction, callSections, doneLabel, hasRows, rowSubtitle, telUrl, toCallCount, type CallAction, type CallList, type CallRow,
} from "../logic/callList"
import { updateCallReminder } from "../notifications"

// Appointment reminders without SMS: the team phones the client. Tomorrow's
// appointments are the ones to call today; today's are listed for reference.
// Mirrors apps/web/components/dashboard/ClientsToCallCard.tsx. Online edition
// only, for staff with appointments.manage on a plan with appointments; a
// failed load (or an empty list) renders nothing, like web.

interface Props {
  /** API branch_id — undefined = all branches (the dashboard's branch scope). */
  branchId: string | undefined
  /** Bumped by the dashboard's pull-to-refresh. */
  refreshSignal: number
}

export function ClientsToCallCard({ branchId, refreshSignal }: Props) {
  const theme = useTheme()
  const can = useCan()
  const planCode = useSessionStore((s) => s.planCode)
  const enabled = !env.EXPO_PUBLIC_OFFLINE_MODE && can("appointments.manage") && hasFeature(planCode, "appointments")
  const q = useQuery<CallList>(enabled ? callListPath(branchId) : null, fetchCallList)
  const [busy, setBusy] = useState<string | null>(null)

  const { refresh, setData, data } = q
  const lastSignal = useRef(refreshSignal)
  useEffect(() => {
    if (lastSignal.current === refreshSignal) return
    lastSignal.current = refreshSignal
    refresh()
  }, [refreshSignal, refresh])

  // Every successful fetch (and local patch) re-plans the 07:30 phone reminder.
  useEffect(() => {
    if (data) void updateCallReminder(data)
  }, [data])

  if (!enabled || !data || !hasRows(data)) return null

  async function act(row: CallRow, action: CallAction) {
    setBusy(row.id)
    try {
      await recordCallAction(row.id, action)
      haptics.success()
      toast.success(actionToast(action, row.customer.full_name))
      setData((prev) => (prev ? applyAction(prev, row.id, action, new Date().toISOString()) : prev))
      refresh()
    } catch (err) {
      haptics.error()
      toast.error(errorMessage(err, "Couldn't save that"))
    } finally {
      setBusy(null)
    }
  }

  const toCall = toCallCount(data)

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="calendar-outline" size={18} color={theme.green600} />
        <Text variant="headline" accessibilityRole="header" style={styles.flex}>
          Clients to call
        </Text>
        {toCall > 0 ? <Chip label={String(toCall)} tone="warning" accessibilityLabel={`${toCall} still to call`} /> : null}
      </View>
      <PressableScale onPress={() => router.navigate("/appointments")} pressGuardMs={600} accessibilityRole="link" style={styles.allLink}>
        <Text variant="label" style={{ color: theme.green600 }}>
          All appointments
        </Text>
      </PressableScale>
      {!data.sms_enabled ? (
        <Text variant="caption" tone="secondary">
          SMS reminders are off — phone these clients to remind them. The same list is emailed to your team each morning.
        </Text>
      ) : null}
      {callSections(data).map((section) => (
        <View key={section.key} style={styles.section}>
          <Text variant="caption" tone="secondary" style={styles.sectionTitle}>
            {section.title.toUpperCase()}
          </Text>
          {section.rows.map((r, i) => (
            <CallRowView key={r.id} row={r} busy={busy === r.id} last={i === section.rows.length - 1} onAction={act} />
          ))}
        </View>
      ))}
    </Card>
  )
}

function CallRowView({ row, busy, last, onAction }: { row: CallRow; busy: boolean; last: boolean; onAction: (r: CallRow, a: CallAction) => Promise<void> }) {
  const theme = useTheme()
  const done = doneLabel(row)
  const phone = row.customer.phone
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }, last && styles.lastRow]}>
      <View style={styles.rowTop}>
        <Text variant="bodyStrong" tabular style={styles.time}>
          {formatTime(row.scheduled_at)}
        </Text>
        <View style={styles.flex}>
          <Text variant="bodyStrong">{row.customer.full_name}</Text>
          <Text variant="caption" tone="secondary">
            {rowSubtitle(row)}
          </Text>
        </View>
      </View>
      <View style={styles.rowActions}>
        {phone ? (
          <PressableScale
            onPress={() => {
              Linking.openURL(telUrl(phone)).catch(() => toast.error("Couldn't open the phone dialer"))
            }}
            pressGuardMs={600}
            accessibilityRole="button"
            accessibilityLabel={`Call ${row.customer.full_name} on ${phone}`}
            style={[styles.phone, { borderColor: theme.border, backgroundColor: theme.green50 }]}
          >
            <Ionicons name="call" size={16} color={theme.green600} />
            <Text variant="label" tabular style={{ color: theme.green600 }}>
              {phone}
            </Text>
          </PressableScale>
        ) : (
          <Text variant="caption" tone="tertiary">
            No phone on file
          </Text>
        )}
        {done ? (
          <View style={styles.done}>
            <Ionicons name="checkmark-circle" size={16} color={theme.green600} />
            <Text variant="label" style={{ color: theme.green600 }}>
              {done}
            </Text>
          </View>
        ) : null}
      </View>
      {!done ? (
        <>
          {row.contact_outcome === "no_answer" ? (
            <Text variant="caption" tone="warning">
              No answer last time
            </Text>
          ) : null}
          <View style={styles.buttons}>
            <Button title="Called" size="sm" variant="secondary" disabled={busy} onPress={() => onAction(row, "called")} style={styles.flex} />
            <Button
              title="No answer"
              size="sm"
              variant="secondary"
              disabled={busy}
              onPress={() => onAction(row, "no_answer")}
              style={styles.flex}
            />
            <Button title="Confirmed" size="sm" disabled={busy} onPress={() => onAction(row, "confirmed")} style={styles.flex} />
          </View>
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
  allLink: { alignSelf: "flex-start", minHeight: TOUCH_TARGET, justifyContent: "center" },
  section: { marginTop: space.sm },
  sectionTitle: { letterSpacing: 0.5 },
  row: { paddingVertical: space.md, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  lastRow: { borderBottomWidth: 0, paddingBottom: 0 },
  rowTop: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  time: { width: 52 },
  rowActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.md },
  phone: {
    flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: TOUCH_TARGET, paddingHorizontal: space.md,
    borderRadius: radius.pill, borderWidth: 1,
  },
  done: { flexDirection: "row", alignItems: "center", gap: space.xs },
  buttons: { flexDirection: "row", gap: space.sm },
})
