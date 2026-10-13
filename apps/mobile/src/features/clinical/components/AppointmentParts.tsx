import Ionicons from "@expo/vector-icons/Ionicons"
import { StyleSheet, View } from "react-native"
import { Button, ListRow, Sheet, StatusBadge, Text } from "../../../components"
import { formatDay, formatTime } from "../../../lib/dates"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { availableActions, statusBadge, type AppointmentAction } from "../logic/appointments"
import type { Appointment } from "../types"
import { confirm as askConfirm } from "../../../lib/confirm"

// Row + action sheet for the Appointments tab — the mobile take on web's
// components/appointments/AppointmentCard.tsx (same actions per status).

/** "family_planning_depo" → "Family planning depo" when no label was stored. */
export function serviceName(a: Pick<Appointment, "service" | "service_label">): string {
  if (a.service_label) return a.service_label
  if (!a.service) return "Appointment"
  const s = a.service.replace(/[_-]+/g, " ").trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function AppointmentRow({ appt, onPress }: { appt: Appointment; onPress: () => void }) {
  const theme = useTheme()
  const badge = statusBadge(appt.status)
  const who = appt.customer?.full_name ?? "Walk-in customer"
  const subtitle = [who, appt.customer?.phone].filter(Boolean).join(" · ")
  const time = formatTime(appt.scheduled_at)
  return (
    <ListRow
      title={serviceName(appt)}
      subtitle={subtitle}
      onPress={onPress}
      accessibilityLabel={`${time}, ${serviceName(appt)} for ${who}, ${badge.label}`}
      accessibilityHint="Shows details and actions"
      leading={
        <View style={styles.time}>
          <Text variant="bodyStrong" tabular>
            {time}
          </Text>
          <Text variant="caption" tone="tertiary">
            {appt.duration_minutes}m
          </Text>
        </View>
      }
      meta={
        <View style={styles.meta}>
          <StatusBadge status={badge.status} label={badge.label} />
          {appt.assignee?.full_name ? (
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              With {appt.assignee.full_name}
            </Text>
          ) : null}
          {appt.next_due_date ? (
            <Text variant="caption" tone="success">
              Next dose due {formatDay(appt.next_due_date)}
            </Text>
          ) : null}
        </View>
      }
      trailing={<Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />}
    />
  )
}

const ACTION_LABEL: Record<AppointmentAction, string> = {
  confirm: "Confirm",
  complete: "Mark completed",
  reschedule: "Reschedule or edit",
  no_show: "Mark no-show",
  cancel: "Cancel appointment",
}

interface AppointmentSheetProps {
  appt: Appointment | null
  canManage: boolean
  busy: AppointmentAction | null
  onClose: () => void
  onAction: (appt: Appointment, action: AppointmentAction) => void | Promise<void>
}

export function AppointmentSheet({ appt, canManage, busy, onClose, onAction }: AppointmentSheetProps) {
  const theme = useTheme()
  const actions = appt && canManage ? availableActions(appt.status) : []
  const badge = appt ? statusBadge(appt.status) : null

  // Returns the action's promise so the pressed button stays locked until it settles.
  async function run(action: AppointmentAction) {
    if (!appt) return
    if (action === "cancel") {
      const ok = await askConfirm({
        title: "Cancel this appointment?",
        message: "Pending reminders won't be sent.",
        cancelLabel: "Keep it",
        confirmLabel: "Cancel appointment",
        destructive: true,
      })
      if (ok) await onAction(appt, "cancel")
      return
    }
    await onAction(appt, action)
  }

  return (
    <Sheet open={!!appt} onClose={onClose} title={appt ? serviceName(appt) : undefined}>
      {appt && badge ? (
        <View style={styles.body}>
          <View style={styles.line}>
            <Ionicons name="time-outline" size={18} color={theme.textSecondary} />
            <Text style={styles.flex}>
              {formatDay(appt.scheduled_at)}, {formatTime(appt.scheduled_at)} · {appt.duration_minutes} min
            </Text>
            <StatusBadge status={badge.status} label={badge.label} />
          </View>
          <View style={styles.line}>
            <Ionicons name="person-outline" size={18} color={theme.textSecondary} />
            <Text style={styles.flex}>
              {appt.customer?.full_name ?? "Walk-in customer"}
              {appt.customer?.phone ? ` · ${appt.customer.phone}` : ""}
            </Text>
          </View>
          {appt.assignee?.full_name ? (
            <View style={styles.line}>
              <Ionicons name="medkit-outline" size={18} color={theme.textSecondary} />
              <Text style={styles.flex}>With {appt.assignee.full_name}</Text>
            </View>
          ) : null}
          {appt.notes ? (
            <View style={styles.line}>
              <Ionicons name="document-text-outline" size={18} color={theme.textSecondary} />
              <Text tone="secondary" style={styles.flex}>
                {appt.notes}
              </Text>
            </View>
          ) : null}
          {appt.next_due_date ? (
            <Text tone="success">Next dose due {formatDay(appt.next_due_date)}</Text>
          ) : null}
          {actions.length > 0 ? (
            <View style={styles.actions}>
              {actions.map((a) => (
                <Button
                  key={a}
                  title={ACTION_LABEL[a]}
                  variant={a === "complete" ? "primary" : a === "cancel" ? "danger" : "secondary"}
                  loading={busy === a}
                  disabled={!!busy && busy !== a}
                  onPress={() => run(a)}
                />
              ))}
            </View>
          ) : canManage ? (
            <Text variant="caption" tone="secondary">
              This appointment is {badge.label.toLowerCase()} — nothing more to do.
            </Text>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  time: { width: 56, alignItems: "flex-end" },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm, marginTop: space.xxs },
  body: { gap: space.md },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
  actions: { gap: space.sm, marginTop: space.xs },
})
