import Ionicons from "@expo/vector-icons/Ionicons"
import { FlashList } from "@shopify/flash-list"
import { router, useFocusEffect } from "expo-router"
import { useCallback, useMemo, useState, type ReactNode } from "react"
import { ScrollView, StyleSheet, View } from "react-native"
import {
  BranchSwitcher, Button, Chip, EmptyState, ErrorState, IconButton, NeedsInternet, Screen, ScreenHeader, Sheet, SkeletonList, Text,
  TextField, useIsOnline,
} from "../../src/components"
import { AppointmentRow, AppointmentSheet, serviceName } from "../../src/features/clinical/components/AppointmentParts"
import { fetchAppointments, updateAppointment, type ApptQuery } from "../../src/features/clinical/data"
import { useDebouncedValue } from "../../src/features/clinical/hooks"
import {
  ACTION_STATUS, groupByNairobiDay, RANGES, STATUS_FILTERS, STATUS_LABEL, type AppointmentAction, type AppointmentRange,
  type AppointmentStatus, type DayListRow, type StatusFilter,
} from "../../src/features/clinical/logic/appointments"
import { useClinicalDirty } from "../../src/features/clinical/store"
import type { Appointment } from "../../src/features/clinical/types"
import { useCan } from "../../src/hooks/useCan"
import { useQuery } from "../../src/hooks/useQuery"
import { errorMessage } from "../../src/lib/api"
import { formatDay } from "../../src/lib/dates"
import { env } from "../../src/lib/env"
import { haptics } from "../../src/lib/haptics"
import { toast } from "../../src/lib/toast"
import { useBranchScope } from "../../src/store/branchScope"
import { useTheme } from "../../src/theme/useTheme"
import { space } from "../../src/theme/tokens"

// Appointments tab — mirrors apps/web/app/(dashboard)/appointments/page.tsx:
// Today / Upcoming / Past ranges, grouped under Nairobi-day headers (Today,
// Tomorrow, Thu 12 Mar…), web's per-status actions (AppointmentCard.tsx) and
// the "book the next dose" prompt when a recurring service is completed.
// Write actions need appointments.manage (the server checks it too). The
// Offline Edition reads/writes the local SQLite repos (features/clinical/data.ts).

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE

type Row = DayListRow<Appointment>

export default function Appointments() {
  const theme = useTheme()
  const can = useCan()
  const canManage = can("appointments.manage")
  const online = useIsOnline()
  const reachable = OFFLINE || online
  const scope = useBranchScope()

  const [range, setRange] = useState<AppointmentRange>("today")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")
  const q = useDebouncedValue(search.trim().length >= 2 ? search.trim() : "", 300)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [busy, setBusy] = useState<AppointmentAction | null>(null)
  const [nextDose, setNextDose] = useState<{ appt: Appointment; due: string } | null>(null)

  const params: ApptQuery = { range, status, q, branchId: scope.branchId }
  const query = useQuery(reachable ? JSON.stringify(params) : null, (key) => fetchAppointments(JSON.parse(key) as ApptQuery))
  const { refresh } = query
  const locked = !!query.data && "locked" in query.data
  const rows = useMemo<Row[]>(
    () => (query.data && !("locked" in query.data) ? groupByNairobiDay(query.data, { newestFirst: range === "past" }) : []),
    [query.data, range],
  )

  // Back from the booking form after a save → reload.
  useFocusEffect(
    useCallback(() => {
      if (useClinicalDirty.getState().take("appointments")) refresh()
    }, [refresh]),
  )

  const book = () => router.push("/appointments/new")

  async function act(appt: Appointment, action: AppointmentAction) {
    if (action === "reschedule") {
      setSelected(null)
      router.push({
        pathname: "/appointments/new",
        params: {
          id: appt.id,
          scheduled_at: appt.scheduled_at,
          duration: String(appt.duration_minutes),
          notes: appt.notes ?? "",
          service_label: serviceName(appt),
          customer_name: appt.customer?.full_name ?? "Walk-in customer",
        },
      })
      return
    }
    const next: AppointmentStatus = ACTION_STATUS[action]
    setBusy(action)
    try {
      const res = await updateAppointment(appt.id, { status: next })
      haptics.success()
      toast.success(`Marked ${STATUS_LABEL[next].toLowerCase()}`)
      setSelected(null)
      // Patch locally; drop rows that no longer match the status filter.
      query.setData((prev) =>
        prev && !("locked" in prev)
          ? prev
              .map((a) => (a.id === appt.id ? { ...a, status: next, next_due_date: res.nextDue ? res.nextDue.slice(0, 10) : a.next_due_date } : a))
              .filter((a) => status === "all" || a.status === status)
          : prev,
      )
      if (next === "completed" && res.nextDue) setNextDose({ appt, due: res.nextDue })
    } catch (err) {
      haptics.error()
      toast.error(errorMessage(err, "Couldn't update the appointment. Please try again."))
    } finally {
      setBusy(null)
    }
  }

  function bookNextDose() {
    if (!nextDose) return
    const { appt, due } = nextDose
    setNextDose(null)
    router.push({
      pathname: "/appointments/new",
      params: {
        customer_id: appt.customer?.id ?? "",
        customer_name: appt.customer?.full_name ?? "",
        customer_phone: appt.customer?.phone ?? "",
        customer_email: appt.customer?.email ?? "",
        service: appt.service ?? "",
        service_label: appt.service_label ?? "",
        scheduled_at: due,
        parent_appointment_id: OFFLINE ? "" : appt.id,
      },
    })
  }

  const filtersActive = status !== "all" || !!search.trim()
  const clearFilters = () => {
    setStatus("all")
    setSearch("")
  }

  const header = (
    <ScreenHeader
      title="Appointments"
      hideBack
      subtitle={scope.canSwitch && !OFFLINE ? scope.label : null}
      right={
        <>
          {OFFLINE ? null : <BranchSwitcher />}
          {canManage && reachable ? <IconButton icon="add" variant="filled" accessibilityLabel="Book appointment" onPress={book} /> : null}
        </>
      }
    />
  )

  if (!reachable) {
    return (
      <Screen>
        {header}
        <NeedsInternet feature="Appointments" />
      </Screen>
    )
  }

  let body: ReactNode
  if (query.loading) body = <SkeletonList rows={6} />
  else if (query.error && !query.data) body = <ErrorState message={query.error} onRetry={query.retry} />
  else if (locked)
    body = (
      <EmptyState
        icon={<Ionicons name="lock-closed-outline" size={32} color={theme.textTertiary} />}
        title="Appointments aren't included in your current plan"
        message="Ask your account owner to upgrade the subscription to unlock appointment booking and reminders."
        action={{ label: "Check again", onPress: query.retry }}
      />
    )
  else
    body = (
      <FlashList
        data={rows}
        keyExtractor={(r) => r.key}
        getItemType={(r) => r.kind}
        renderItem={({ item }) =>
          item.kind === "header" ? (
            <View style={[styles.dayHeader, { backgroundColor: theme.bg }]} accessibilityRole="header">
              <Text variant="label" tone="secondary">
                {item.label}
              </Text>
              <Text variant="caption" tone="tertiary">
                {item.count} {item.count === 1 ? "appointment" : "appointments"}
              </Text>
            </View>
          ) : (
            <AppointmentRow appt={item.item} onPress={() => setSelected(item.item)} />
          )
        }
        refreshing={query.refreshing}
        onRefresh={query.refresh}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={query.error ? <ErrorState compact message={query.error} onRetry={query.retry} /> : null}
        ListEmptyComponent={
          filtersActive ? (
            <EmptyState
              icon={<Ionicons name="search-outline" size={32} color={theme.textTertiary} />}
              message={`No ${range} appointments match these filters`}
              action={{ label: "Clear filters", onPress: clearFilters }}
            />
          ) : (
            <EmptyState
              icon={<Ionicons name="calendar-outline" size={32} color={theme.textTertiary} />}
              message={`No ${range} appointments`}
              action={canManage && range !== "past" ? { label: "Book appointment", onPress: book } : undefined}
            />
          )
        }
      />
    )

  return (
    <Screen>
      {header}
      <View style={styles.controls}>
        <TextField
          label="Search appointments"
          hideLabel
          value={search}
          onChangeText={setSearch}
          placeholder="Customer name or phone"
          autoCorrect={false}
          returnKeyType="search"
          leading={<Ionicons name="search-outline" size={20} color={theme.textTertiary} />}
          trailing={
            search ? <IconButton icon="close-circle" accessibilityLabel="Clear search" color={theme.textTertiary} onPress={() => setSearch("")} /> : null
          }
        />
        <View style={styles.ranges}>
          {RANGES.map((r) => (
            <Chip
              key={r.key}
              label={r.label}
              selected={range === r.key}
              onPress={() => setRange(r.key)}
              accessibilityLabel={`Show ${r.label.toLowerCase()} appointments`}
              style={styles.rangeChip}
            />
          ))}
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {STATUS_FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              selected={status === f.key}
              onPress={() => setStatus(f.key)}
              accessibilityLabel={f.key === "all" ? "Any status" : `Only ${f.label.toLowerCase()}`}
            />
          ))}
        </ScrollView>
      </View>
      <View style={styles.flex}>{body}</View>

      <AppointmentSheet appt={selected} canManage={canManage} busy={busy} onClose={() => setSelected(null)} onAction={act} />

      <Sheet open={!!nextDose} onClose={() => setNextDose(null)} title="Book the next dose?">
        {nextDose ? (
          <View style={styles.nextDose}>
            <Text>
              {serviceName(nextDose.appt)} for {nextDose.appt.customer?.full_name ?? "this customer"} is next due on{" "}
              <Text variant="bodyStrong">{formatDay(nextDose.due)}</Text>.
            </Text>
            <Button
              title="Book next dose"
              onPress={bookNextDose}
              leadingIcon={<Ionicons name="calendar-outline" size={18} color={theme.onAccent} />}
            />
            <Button title="Not now" variant="ghost" onPress={() => setNextDose(null)} />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  controls: { gap: space.sm, marginBottom: space.sm },
  ranges: { flexDirection: "row", gap: space.sm },
  rangeChip: { flex: 1, justifyContent: "center" },
  chips: { gap: space.sm },
  dayHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingTop: space.lg, paddingBottom: space.xs },
  nextDose: { gap: space.md },
})
