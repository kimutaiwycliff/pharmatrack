import Ionicons from "@expo/vector-icons/Ionicons"
import { router, useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { StyleSheet, Switch, View } from "react-native"
import {
  Button, Chip, DateField, EmptyState, ErrorState, FormScroll, NeedsInternet, Screen, ScreenHeader, SkeletonBlock, Text, TextField,
  useIsOnline,
} from "../../src/components"
import { CustomerFields, type CustomerValue } from "../../src/features/clinical/components/CustomerFields"
import { createAppointment, fetchServices, updateAppointment } from "../../src/features/clinical/data"
import {
  defaultBookingTime, hasErrors, nextDoseDate, recurrenceHint, validateBooking, type BookingErrors,
} from "../../src/features/clinical/logic/appointments"
import { useClinicalDirty } from "../../src/features/clinical/store"
import type { ServiceOption } from "../../src/features/clinical/types"
import { useCan } from "../../src/hooks/useCan"
import { useQuery } from "../../src/hooks/useQuery"
import { errorMessage } from "../../src/lib/api"
import { formatDay } from "../../src/lib/dates"
import { env } from "../../src/lib/env"
import { haptics } from "../../src/lib/haptics"
import { toast } from "../../src/lib/toast"
import { useBranchScope } from "../../src/store/branchScope"
import { useSessionStore } from "../../src/store/session"
import { useTheme } from "../../src/theme/useTheme"
import { radius, space } from "../../src/theme/tokens"

// Book / reschedule an appointment — mirrors apps/web/components/appointments/
// BookAppointmentDialog.tsx and the createSchema / updateSchema in
// apps/web/app/api/appointments/{route,[id]/route}.ts.
//  - New: customer (autocomplete or new), service (with its recurrence and the
//    next-dose date it implies), date + time, duration, branch, notes,
//    reminder opt-in. Prefilled by the tab's "Book next dose" prompt.
//  - Edit (`id` param): reschedule, duration and notes. The customer and
//    service stay as booked (web's PATCH can't relabel a service).
// Offline Edition: saved to the local repo; no reminders there (no messaging).

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE

type Params = {
  id?: string
  scheduled_at?: string
  duration?: string
  notes?: string
  service?: string
  service_label?: string
  customer_id?: string
  customer_name?: string
  customer_phone?: string
  customer_email?: string
  parent_appointment_id?: string
}

function initialDate(iso: string | undefined): Date {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? d : defaultBookingTime()
}

export default function BookAppointment() {
  const theme = useTheme()
  const can = useCan()
  const online = useIsOnline()
  const reachable = OFFLINE || online
  const p = useLocalSearchParams<Params>()
  const editing = !!p.id

  const scope = useBranchScope()
  const sessionBranchId = useSessionStore((s) => s.branchId)
  const branches = useSessionStore((s) => s.branches)
  const canPickBranch = !OFFLINE && !editing && can("branches.all") && branches.length > 1

  const [customer, setCustomer] = useState<CustomerValue>({
    customerId: p.customer_id || undefined,
    name: p.customer_name ?? "",
    phone: p.customer_phone ?? "",
    email: p.customer_email ?? "",
  })
  const [optIn, setOptIn] = useState(true)
  const [service, setService] = useState<string | null>(p.service || null)
  const [when, setWhen] = useState<Date | null>(() => initialDate(p.scheduled_at))
  const [duration, setDuration] = useState(p.duration || "15")
  const [notes, setNotes] = useState(p.notes ?? "")
  const [branchId, setBranchId] = useState<string | null>(scope.branchId ?? sessionBranchId)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  const services = useQuery(reachable && !editing ? "appointment-services" : null, () => fetchServices())
  const list: ServiceOption[] = services.data ?? []
  // Prefill may carry a slug (online) or only a label (Offline Edition rows);
  // with nothing chosen, default to the first service like web does.
  const chosen =
    list.find((s) => s.slug === service) ??
    (service ? undefined : list.find((s) => !!p.service_label && s.label === p.service_label)) ??
    (service ? undefined : list[0])

  const errors: BookingErrors = submitted
    ? validateBooking({
        customerName: customer.name, phone: customer.phone, email: customer.email, serviceSlug: editing ? "kept" : (chosen?.slug ?? null),
        scheduledAt: when, duration, notes, editing,
      })
    : {}

  const next = chosen ? nextDoseDate(when ?? new Date(), chosen.recurrence_weeks) : null
  const serviceHelper = chosen?.recurrence_weeks
    ? `${recurrenceHint(chosen.recurrence_weeks)}${next ? ` — next dose would be due ${formatDay(next)}` : ""}`
    : null

  async function save() {
    setSubmitted(true)
    const e = validateBooking({
      customerName: customer.name, phone: customer.phone, email: customer.email, serviceSlug: editing ? "kept" : (chosen?.slug ?? null),
      scheduledAt: when, duration, notes, editing,
    })
    if (hasErrors(e) || !when) {
      haptics.error()
      return
    }
    setSaving(true)
    try {
      if (editing && p.id) {
        await updateAppointment(p.id, { scheduled_at: when.toISOString(), duration_minutes: Number(duration), notes: notes.trim() || null })
        toast.success("Appointment updated")
      } else {
        if (!branchId) throw new Error("No branch selected — try again once your session has loaded")
        if (!chosen) throw new Error("Choose a service")
        await createAppointment({
          customer_id: customer.customerId,
          customer_name: customer.name.trim(),
          customer_phone: customer.phone.trim() || undefined,
          customer_email: customer.email.trim() || undefined,
          branch_id: branchId,
          service: chosen.slug,
          service_label: chosen.label,
          scheduled_at: when.toISOString(),
          duration_minutes: Number(duration),
          notes: notes.trim() || undefined,
          parent_appointment_id: p.parent_appointment_id || undefined,
          reminders_opt_in: optIn,
        })
        toast.success("Appointment booked")
      }
      haptics.success()
      useClinicalDirty.getState().mark("appointments")
      router.back()
    } catch (err) {
      haptics.error()
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const title = editing ? "Reschedule appointment" : "Book appointment"

  if (!can("appointments.manage")) {
    return (
      <Screen>
        <ScreenHeader title={title} />
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={32} color={theme.textTertiary} />}
          message="You don't have permission to book appointments."
        />
      </Screen>
    )
  }
  if (!reachable) {
    return (
      <Screen>
        <ScreenHeader title={title} />
        <NeedsInternet feature="Booking appointments" />
      </Screen>
    )
  }

  const footer = (
    <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.bg }]}>
      <Button title="Cancel" variant="secondary" onPress={() => router.back()} style={styles.flex} />
      <Button title={editing ? "Save changes" : "Book appointment"} onPress={save} loading={saving} style={styles.flex} />
    </View>
  )

  return (
    <Screen>
      <ScreenHeader title={title} />
      <FormScroll footer={footer}>
        {editing ? (
          <View style={[styles.summary, { borderColor: theme.border, backgroundColor: theme.surface }]} accessible>
            <Text variant="bodyStrong">{p.service_label || "Appointment"}</Text>
            <Text tone="secondary">{p.customer_name || "Walk-in customer"}</Text>
          </View>
        ) : (
          <>
            <Text variant="label" tone="secondary" accessibilityRole="header">
              Customer
            </Text>
            <CustomerFields
              nameLabel="Customer name"
              value={customer}
              onChange={(patch) => setCustomer((c) => ({ ...c, ...patch }))}
              onPick={(c) => {
                setCustomer({ customerId: c.id, name: c.full_name, phone: c.phone ?? "", email: c.email ?? "" })
                setOptIn(c.reminders_opt_in ?? true)
              }}
              showEmail={!OFFLINE}
              errors={{ name: errors.customerName, phone: errors.phone, email: errors.email }}
            />

            <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.section}>
              Service
            </Text>
            {services.loading ? (
              <SkeletonBlock height={48} />
            ) : services.error ? (
              <ErrorState compact message={services.error} onRetry={services.retry} />
            ) : list.length === 0 ? (
              <Text tone="secondary">No services yet — an owner or manager can add them in Settings → Services.</Text>
            ) : (
              <View style={styles.services} accessibilityRole="radiogroup" accessibilityLabel="Service">
                {list.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.label}
                    selected={chosen?.id === s.id}
                    onPress={() => setService(s.slug)}
                    accessibilityLabel={`${s.label}${s.recurrence_weeks ? `, ${recurrenceHint(s.recurrence_weeks)}` : ""}`}
                  />
                ))}
              </View>
            )}
            {errors.service ? (
              <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
                {list.length === 0 ? "Add a service in Settings → Services first" : errors.service}
              </Text>
            ) : serviceHelper ? (
              <View style={styles.hint}>
                <Ionicons name="repeat-outline" size={16} color={theme.green600} />
                <Text variant="caption" tone="success" style={styles.flex}>
                  {serviceHelper}
                </Text>
              </View>
            ) : null}
          </>
        )}

        <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.section}>
          When
        </Text>
        <DateField label="Date and time" mode="datetime" value={when} onChange={setWhen} error={errors.scheduledAt} />
        {/* The Offline Edition's local create always books 15 minutes. */}
        {OFFLINE && !editing ? null : (
          <TextField
            label="Duration (minutes)"
            value={duration}
            onChangeText={setDuration}
            keyboardType="number-pad"
            error={errors.duration}
          />
        )}

        {canPickBranch ? (
          <>
            <Text variant="label" tone="secondary">
              Branch
            </Text>
            <View style={styles.services}>
              {branches.map((b) => (
                <Chip key={b.id} label={b.name} selected={branchId === b.id} onPress={() => setBranchId(b.id)} accessibilityLabel={`Book at ${b.name}`} />
              ))}
            </View>
          </>
        ) : null}

        <TextField
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          multiline
          inputStyle={styles.notes}
          error={errors.notes}
        />

        {!OFFLINE && !editing ? (
          <View style={[styles.optIn, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <View style={styles.flex}>
              <Text variant="bodyStrong">Send appointment reminders</Text>
              <Text variant="caption" tone="secondary">
                A reminder goes out the day before — WhatsApp or SMS to the customer (plus email if available). Messaging may be
                charged — turn off to skip for this customer.
              </Text>
            </View>
            <Switch
              value={optIn}
              onValueChange={setOptIn}
              accessibilityLabel="Send appointment reminders"
              trackColor={{ true: theme.green, false: theme.borderStrong }}
              thumbColor={theme.surface}
            />
          </View>
        ) : null}
      </FormScroll>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { marginTop: space.sm },
  summary: { gap: space.xxs, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  services: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  hint: { flexDirection: "row", alignItems: "center", gap: space.xs },
  notes: { minHeight: 72, textAlignVertical: "top" },
  optIn: { flexDirection: "row", alignItems: "center", gap: space.md, borderWidth: 1, borderRadius: radius.md, padding: space.md, minHeight: 48 },
  footer: { flexDirection: "row", gap: space.sm, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
})
