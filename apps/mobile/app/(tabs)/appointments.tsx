import { useEffect, useState } from "react"
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { apiFetch } from "../../src/lib/api-fetch"
import { env } from "../../src/lib/env"
import { listLocalAppointments, listLocalAppointmentServices, createLocalAppointment } from "../../src/repo/clinical"
import { useSessionStore } from "../../src/store/session"
import { useTheme } from "../../src/theme/useTheme"
import type { Theme } from "../../src/theme/tokens"
import { Button, Card, EmptyState, Screen, StatusBadge } from "../../src/components"
import type { BadgeStatus } from "../../src/components"

// Mirrors apps/web/app/api/appointments/route.ts's WRITE_ROLES exactly
// (verified against that file and apps/web/app/api/appointments/[id]/route.ts
// directly, not from memory) — the server enforces this same gate on
// POST/PATCH/DELETE, so the UI hides actions a cashier's request would just
// get a 403 for. This is the one screen in the mobile app so far that
// role-gates a feature in the UI, not just via server-side rejection.
const WRITE_ROLES = ["owner", "manager", "pharmacist"]

// Mirrors apps/web/lib/appointments/serialize.ts's shapeAppt() output exactly
// (verified against that file plus packages/db/src/schema/clinical.ts's
// `appointment` table directly, not from memory): the appointment row spread
// + a small customer object + assignee. Dates arrive as ISO strings over JSON.
interface AppointmentCustomer {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  reminders_opt_in: boolean | null
}

interface AppointmentAssignee {
  id: string
  full_name: string | null
}

interface Appointment {
  id: string
  branch_id: string | null
  customer_id: string
  service: string | null
  service_label: string | null
  scheduled_at: string
  duration_minutes: number
  status: string
  assigned_to: string | null
  notes: string | null
  customer: AppointmentCustomer | null
  assignee: AppointmentAssignee | null
}

interface AppointmentsResponse {
  appointments: Appointment[]
}

// Mirrors apps/web/app/api/appointment-services/route.ts's response shape —
// the tenant's own bookable service catalogue (appointment_service table),
// not the static fallback list in apps/web/lib/appointments/services.ts.
// GET is open to any authenticated staff role, so this loads regardless of
// write access, keeping the read-only view useful too (not currently
// rendered outside the booking form, but harmless to have available).
interface AppointmentServiceOption {
  id: string
  slug: string
  label: string
  recurrence_weeks: number | null
}

interface AppointmentServicesResponse {
  services: AppointmentServiceOption[]
}

// Matches the appointment.status column's known values exactly (see the
// `status` enum in apps/web/app/api/appointments/[id]/route.ts's updateSchema)
// plus "all" for the unfiltered view.
type StatusFilter = "all" | "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show"

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "scheduled", label: "Scheduled" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "no_show", label: "No-show" },
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function badgeFor(status: string): { status: BadgeStatus; label: string } {
  switch (status) {
    case "confirmed":
      return { status: "ok", label: "Confirmed" }
    case "completed":
      return { status: "ok", label: "Completed" }
    case "cancelled":
      return { status: "danger", label: "Cancelled" }
    case "no_show":
      return { status: "warning", label: "No-show" }
    case "scheduled":
    default:
      return { status: "neutral", label: "Scheduled" }
  }
}

// Devices run exclusively in Kenya (single timezone, no DST — see shifts.tsx/
// dashboard.tsx), so the device's local clock reads as Africa/Nairobi time.
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const datePart = d.toLocaleDateString([], { day: "2-digit", month: "short" })
  const timePart = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  return `${datePart}, ${timePart}`
}

export default function Appointments() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { branchId, role } = useSessionStore()
  const canWrite = role != null && WRITE_ROLES.includes(role)

  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [featureLocked, setFeatureLocked] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  // Bumped by retry/pull-to-refresh to re-run the effect below without
  // exposing the fetch function itself as a captured effect dependency
  // (mirrors inventory.tsx/dashboard.tsx's shape, required by this repo's
  // react-hooks/set-state-in-effect rule).
  const [reloadToken, setReloadToken] = useState(0)

  const [services, setServices] = useState<AppointmentServiceOption[]>([])
  const [showBookingForm, setShowBookingForm] = useState(false)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [dateInput, setDateInput] = useState("")
  const [timeInput, setTimeInput] = useState("")
  const [notes, setNotes] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!branchId) return
    const currentBranchId = branchId
    async function load() {
      const from = new Date()
      from.setHours(0, 0, 0, 0)
      const to = new Date(from)
      to.setDate(to.getDate() + 14)
      const trimmed = query.trim()
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        try {
          const json = await listLocalAppointments({
            branchId: currentBranchId, from: from.toISOString(), to: to.toISOString(),
            status: statusFilter, q: trimmed.length >= 2 ? trimmed : undefined,
          })
          setAppointments(json.appointments)
          setFeatureLocked(false)
          setLoaded(true)
          setError(null)
        } finally {
          setRefreshing(false)
        }
        return
      }
      try {
        const params = new URLSearchParams({
          branch_id: currentBranchId,
          from: from.toISOString(),
          to: to.toISOString(),
          status: statusFilter,
        })
        if (trimmed.length >= 2) params.set("q", trimmed)
        const res = await apiFetch(`/api/appointments?${params.toString()}`)
        if (res.status === 403) {
          const body = await res.json().catch(() => null)
          if (body?.code === "feature_locked") {
            setFeatureLocked(true)
            setError(null)
            setLoaded(true)
            return
          }
          setError("You don't have permission to view appointments.")
          setLoaded(true)
          return
        }
        if (!res.ok) {
          setError(`Could not load appointments (HTTP ${res.status})`)
          return
        }
        const json = (await res.json()) as AppointmentsResponse
        setAppointments(json.appointments)
        setFeatureLocked(false)
        setLoaded(true)
        setError(null)
      } catch {
        setError("Could not reach the server. Check your connection and try again.")
      } finally {
        setRefreshing(false)
      }
    }
    load()
  }, [branchId, statusFilter, query, reloadToken])

  // Services power the booking form's picker; only fetched for roles that can
  // actually book (read is open server-side, but a cashier never sees the form).
  useEffect(() => {
    if (!canWrite) return
    async function loadServices() {
      try {
        if (env.EXPO_PUBLIC_OFFLINE_MODE) {
          setServices((await listLocalAppointmentServices()).services)
          return
        }
        const res = await apiFetch("/api/appointment-services")
        if (!res.ok) return
        const json = (await res.json()) as AppointmentServicesResponse
        setServices(json.services)
      } catch {
        // Non-fatal — the booking form still works with no service selected
        // pre-picked; the picker just renders empty.
      }
    }
    loadServices()
  }, [canWrite])

  function retry() {
    setReloadToken((t) => t + 1)
  }

  function onRefresh() {
    setRefreshing(true)
    setReloadToken((t) => t + 1)
  }

  function resetForm() {
    setCustomerName("")
    setCustomerPhone("")
    setSelectedService(null)
    setDateInput("")
    setTimeInput("")
    setNotes("")
    setFormError(null)
  }

  async function handleSubmitBooking() {
    setFormError(null)
    const trimmedName = customerName.trim()
    if (!trimmedName) {
      setFormError("Customer name is required")
      return
    }
    if (!selectedService) {
      setFormError("Select a service")
      return
    }
    if (!branchId) {
      setFormError("Session still loading — try again in a moment")
      return
    }
    const trimmedDate = dateInput.trim()
    const trimmedTime = timeInput.trim()
    if (!DATE_RE.test(trimmedDate) || !TIME_RE.test(trimmedTime)) {
      setFormError("Enter date as YYYY-MM-DD and time as HH:MM (24-hour)")
      return
    }
    const scheduled = new Date(`${trimmedDate}T${trimmedTime}:00`)
    if (Number.isNaN(scheduled.getTime())) {
      setFormError("Enter a valid date and time")
      return
    }

    setSubmitting(true)
    try {
      const service = services.find((s) => s.slug === selectedService)
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        await createLocalAppointment({
          customerName: trimmedName, customerPhone: customerPhone.trim() || null, branchId,
          service: selectedService, serviceLabel: service?.label, scheduledAt: scheduled.toISOString(),
          notes: notes.trim() || null,
        })
      } else {
        const res = await apiFetch("/api/appointments", {
          method: "POST",
          body: JSON.stringify({
            customer_name: trimmedName,
            customer_phone: customerPhone.trim() || undefined,
            branch_id: branchId,
            service: selectedService,
            service_label: service?.label,
            scheduled_at: scheduled.toISOString(),
            notes: notes.trim() || undefined,
          }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          setFormError(body?.error ?? `Could not book appointment (HTTP ${res.status})`)
          return
        }
      }
      setShowBookingForm(false)
      resetForm()
      setReloadToken((t) => t + 1)
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (error && !loaded) {
    return (
      <Screen style={styles.centered}>
        <Card style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
          <Button
            title="Retry"
            variant="secondary"
            onPress={retry}
            icon={<Ionicons name="refresh-outline" size={18} color={theme.text} />}
          />
        </Card>
      </Screen>
    )
  }

  if (!loaded) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.label}>Loading…</Text>
      </Screen>
    )
  }

  if (featureLocked) {
    return (
      <Screen style={styles.centered}>
        <Card style={styles.errorCard}>
          <Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />
          <Text style={styles.lockedTitle}>Appointments aren&apos;t included in your current plan</Text>
          <Text style={styles.lockedMessage}>
            Ask your account owner to upgrade the subscription to unlock appointment booking and reminders.
          </Text>
          <Button
            title="Check again"
            variant="secondary"
            onPress={retry}
            icon={<Ionicons name="refresh-outline" size={18} color={theme.text} />}
          />
        </Card>
      </Screen>
    )
  }

  return (
    <Screen>
      <FlatList
        data={appointments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.green} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Appointments</Text>
              {canWrite ? (
                <Button
                  title={showBookingForm ? "Close" : "New"}
                  onPress={() => setShowBookingForm((v) => !v)}
                  icon={
                    showBookingForm ? undefined : <Ionicons name="add" size={18} color="#fff" />
                  }
                  style={styles.newButton}
                />
              ) : null}
            </View>

            {canWrite && showBookingForm ? (
              <Card style={styles.formCard}>
                <Text style={styles.formTitle}>New appointment</Text>

                <TextInput
                  style={styles.input}
                  placeholder="Customer name"
                  placeholderTextColor={theme.textTertiary}
                  value={customerName}
                  onChangeText={setCustomerName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Phone number"
                  placeholderTextColor={theme.textTertiary}
                  keyboardType="phone-pad"
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                />

                <Text style={styles.fieldLabel}>Service</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterRow}
                >
                  {services.length === 0 ? (
                    <Text style={styles.emptyServicesText}>No services configured yet</Text>
                  ) : (
                    services.map((s) => (
                      <Pressable
                        key={s.id}
                        onPress={() => setSelectedService(s.slug)}
                        style={[styles.chip, selectedService === s.slug && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, selectedService === s.slug && styles.chipTextActive]}>
                          {s.label}
                        </Text>
                      </Pressable>
                    ))
                  )}
                </ScrollView>

                <Text style={styles.fieldLabel}>Date and time</Text>
                <View style={styles.dateTimeRow}>
                  <TextInput
                    style={[styles.input, styles.dateInput]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.textTertiary}
                    autoCapitalize="none"
                    value={dateInput}
                    onChangeText={setDateInput}
                  />
                  <TextInput
                    style={[styles.input, styles.timeInput]}
                    placeholder="HH:MM"
                    placeholderTextColor={theme.textTertiary}
                    autoCapitalize="none"
                    value={timeInput}
                    onChangeText={setTimeInput}
                  />
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Notes (optional)"
                  placeholderTextColor={theme.textTertiary}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />

                {formError ? <Text style={styles.error}>{formError}</Text> : null}

                <View style={styles.formActionsRow}>
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={() => {
                      setShowBookingForm(false)
                      resetForm()
                    }}
                    style={styles.formActionButton}
                  />
                  <Button title="Book" onPress={handleSubmitBooking} loading={submitting} style={styles.formActionButton} />
                </View>
              </Card>
            ) : null}

            <TextInput
              style={styles.searchInput}
              placeholder="Search by customer name or phone"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="none"
              value={query}
              onChangeText={setQuery}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {FILTERS.map((f) => (
                <Pressable
                  key={f.key}
                  onPress={() => setStatusFilter(f.key)}
                  style={[styles.chip, statusFilter === f.key && styles.chipActive]}
                >
                  <Text style={[styles.chipText, statusFilter === f.key && styles.chipTextActive]}>{f.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {error ? <Text style={styles.inlineError}>{error}</Text> : null}
          </View>
        }
        renderItem={({ item }) => <AppointmentRow appointment={item} styles={styles} />}
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="calendar-outline" size={28} color={theme.textTertiary} />}
            message="No appointments in the next two weeks"
          />
        }
      />
    </Screen>
  )
}

function AppointmentRow({ appointment, styles }: { appointment: Appointment; styles: Styles }) {
  const badge = badgeFor(appointment.status)
  const name = appointment.customer?.full_name ?? "Walk-in customer"
  const phone = appointment.customer?.phone
  const serviceLabel = appointment.service_label ?? appointment.service ?? "Appointment"

  return (
    <Card style={styles.apptCard}>
      <View style={styles.apptHeaderRow}>
        <View style={styles.apptNameCol}>
          <Text style={styles.apptName} numberOfLines={1}>
            {name}
          </Text>
          {phone ? (
            <Text style={styles.apptMeta} numberOfLines={1}>
              {phone}
            </Text>
          ) : null}
        </View>
        <StatusBadge status={badge.status} label={badge.label} />
      </View>

      <View style={styles.apptFooterRow}>
        <Text style={styles.apptService} numberOfLines={1}>
          {serviceLabel}
        </Text>
        <Text style={styles.apptTime}>{formatDateTime(appointment.scheduled_at)}</Text>
      </View>

      {appointment.assignee?.full_name ? (
        <Text style={styles.apptAssignee}>With {appointment.assignee.full_name}</Text>
      ) : null}
    </Card>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
    label: { fontSize: 15, color: theme.text },
    error: { color: theme.red },
    errorCard: { gap: 8 },
    inlineError: { color: theme.red, fontSize: 13 },
    lockedTitle: { fontSize: 16, fontWeight: "700", color: theme.text, textAlign: "center" },
    lockedMessage: { fontSize: 13, color: theme.textSecondary, textAlign: "center" },

    listContent: { paddingBottom: 24 },
    header: { gap: 10, marginBottom: 12 },
    titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    title: { fontSize: 20, fontWeight: "700", color: theme.text },
    newButton: { paddingVertical: 10, paddingHorizontal: 16 },

    formCard: { gap: 10 },
    formTitle: { fontSize: 15, fontWeight: "700", color: theme.text },
    fieldLabel: { fontSize: 12, fontWeight: "600", color: theme.textSecondary },
    emptyServicesText: { fontSize: 13, color: theme.textTertiary, paddingVertical: 8 },
    dateTimeRow: { flexDirection: "row", gap: 8 },
    dateInput: { flex: 3 },
    timeInput: { flex: 2 },
    formActionsRow: { flexDirection: "row", gap: 8, marginTop: 4 },
    formActionButton: { flex: 1 },

    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontSize: 15,
      backgroundColor: theme.surface,
      color: theme.text,
    },

    searchInput: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontSize: 15,
      backgroundColor: theme.surface,
      color: theme.text,
    },

    filterRow: { gap: 8, paddingVertical: 2 },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.muted,
    },
    chipActive: { backgroundColor: theme.greenCta, borderColor: theme.greenCta },
    chipText: { fontSize: 13, fontWeight: "600", color: theme.textSecondary },
    chipTextActive: { color: "#fff" },

    rowGap: { height: 8 },
    apptCard: { gap: 8 },
    apptHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
    apptNameCol: { flex: 1, gap: 2 },
    apptName: { fontSize: 15, fontWeight: "600", color: theme.text },
    apptMeta: { fontSize: 12, color: theme.textSecondary },
    apptFooterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
    apptService: { flex: 1, fontSize: 13, color: theme.textSecondary },
    apptTime: { fontSize: 13, fontWeight: "600", color: theme.text },
    apptAssignee: { fontSize: 12, color: theme.textTertiary },
  })
}

type Styles = ReturnType<typeof createStyles>
