import { useEffect, useState } from "react"
import { StyleSheet, Text, TextInput } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { useSessionStore } from "../../src/store/session"
import { useShiftStore, type ShiftResponse } from "../../src/store/shift"
import { varianceSeverity, type VarianceSeverity } from "../../src/lib/shifts/variance"
import { useTheme } from "../../src/theme/useTheme"
import type { Theme } from "../../src/theme/tokens"
import { Button, Card, Screen, StatusBadge, type BadgeStatus } from "../../src/components"

const SEVERITY_LABEL: Record<VarianceSeverity, string> = {
  ok: "Balanced",
  warn: "Minor variance",
  serious: "Needs explaining",
}

function badgeStatusFor(severity: VarianceSeverity | null): BadgeStatus {
  switch (severity) {
    case "ok":
      return "ok"
    case "warn":
      return "warning"
    case "serious":
      return "danger"
    default:
      return "neutral"
  }
}

// Devices run exclusively in Kenya (single timezone, no DST), so the device's
// local clock reads as Africa/Nairobi time for display purposes here.
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export default function Shifts() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { branchId } = useSessionStore()
  const { activeShift, loaded, error, loadActiveShift, clockIn, clockOut } = useShiftStore()

  const [openingFloatInput, setOpeningFloatInput] = useState("")
  const [closingCashInput, setClosingCashInput] = useState("")
  const [showClosingForm, setShowClosingForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ shift: ShiftResponse; variance: number | null } | null>(null)

  useEffect(() => {
    loadActiveShift()
  }, [loadActiveShift])

  async function handleClockIn() {
    setFormError(null)
    const value = Number(openingFloatInput)
    if (!branchId) {
      setFormError("Session still loading — try again in a moment")
      return
    }
    if (!openingFloatInput || Number.isNaN(value) || value < 0) {
      setFormError("Enter a valid opening float")
      return
    }
    setPending(true)
    try {
      await clockIn(value, branchId)
      setOpeningFloatInput("")
    } finally {
      setPending(false)
    }
  }

  async function handleClockOut() {
    setFormError(null)
    const value = Number(closingCashInput)
    if (!closingCashInput || Number.isNaN(value) || value < 0) {
      setFormError("Enter a valid closing cash amount")
      return
    }
    setPending(true)
    try {
      const out = await clockOut(value)
      if (out) {
        setResult(out)
        setShowClosingForm(false)
        setClosingCashInput("")
      }
    } finally {
      setPending(false)
    }
  }

  if (result) {
    const severity = varianceSeverity(result.variance)
    return (
      <Screen style={styles.centered}>
        <Ionicons name="checkmark-circle-outline" size={56} color={theme.green} />
        <Text style={styles.title}>Shift closed</Text>
        <Card style={styles.resultCard}>
          <Text style={styles.label}>Opening float: {formatKES(Math.round(result.shift.opening_float * 100))}</Text>
          <Text style={styles.label}>
            Closing cash: {formatKES(Math.round((result.shift.closing_cash ?? 0) * 100))}
          </Text>
          <Text style={styles.label}>
            Variance: {result.variance == null ? "—" : formatKES(Math.round(result.variance * 100))}
          </Text>
          <StatusBadge status={badgeStatusFor(severity)} label={severity ? SEVERITY_LABEL[severity] : "No variance"} />
        </Card>
        <Button title="Done" onPress={() => setResult(null)} style={styles.doneButton} />
      </Screen>
    )
  }

  if (error && !loaded) {
    return (
      <Screen style={styles.centered}>
        <Card style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
          <Button
            title="Retry"
            variant="secondary"
            onPress={() => loadActiveShift()}
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

  if (activeShift) {
    return (
      <Screen style={styles.container}>
        <Text style={styles.title}>Current shift</Text>
        <Card style={styles.shiftCard}>
          <Text style={styles.label}>Opening float: {formatKES(Math.round(activeShift.openingFloat * 100))}</Text>
          <Text style={styles.label}>Clocked in at: {formatTime(activeShift.clockedInAt)}</Text>
        </Card>

        {showClosingForm ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Closing cash (KES)"
              placeholderTextColor={theme.textTertiary}
              keyboardType="decimal-pad"
              value={closingCashInput}
              onChangeText={setClosingCashInput}
            />
            {formError || error ? <Text style={styles.error}>{formError ?? error}</Text> : null}
            <Button title="Confirm clock-out" onPress={handleClockOut} loading={pending} variant="danger" />
            <Button
              title="Cancel"
              variant="secondary"
              onPress={() => {
                setShowClosingForm(false)
                setFormError(null)
              }}
            />
          </>
        ) : (
          <Button
            title="Clock out"
            variant="danger"
            onPress={() => setShowClosingForm(true)}
            icon={<Ionicons name="log-out-outline" size={18} color="#fff" />}
          />
        )}
      </Screen>
    )
  }

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>Clock in</Text>
      <Text style={styles.subtitle}>Clock in with an opening cash float before taking sales.</Text>
      <TextInput
        style={styles.input}
        placeholder="Opening float (KES)"
        placeholderTextColor={theme.textTertiary}
        keyboardType="decimal-pad"
        value={openingFloatInput}
        onChangeText={setOpeningFloatInput}
      />
      {formError || error ? <Text style={styles.error}>{formError ?? error}</Text> : null}
      <Button
        title="Clock in"
        onPress={handleClockIn}
        loading={pending}
        icon={<Ionicons name="time-outline" size={18} color="#fff" />}
      />
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { gap: 12 },
    centered: { alignItems: "center", justifyContent: "center", gap: 8 },
    title: { fontSize: 18, fontWeight: "700", color: theme.text },
    subtitle: { fontSize: 14, color: theme.textSecondary },
    label: { fontSize: 15, color: theme.text },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      padding: 10,
      fontSize: 15,
      backgroundColor: theme.surface,
      color: theme.text,
    },
    shiftCard: { gap: 6 },
    resultCard: { gap: 8, alignItems: "flex-start", minWidth: 220 },
    errorCard: { gap: 8 },
    doneButton: { marginTop: 16, minWidth: 160 },
    error: { color: theme.red },
  })
}
