import { useEffect, useMemo, useState } from "react"
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { useSessionStore } from "../../src/store/session"
import { useShiftStore, type ShiftResponse } from "../../src/store/shift"
import { staffCan, useStaffStore } from "../../src/store/staff"
import { useSyncStore } from "../../src/store/sync"
import { env } from "../../src/lib/env"
import { scheduleSoonSync, syncNow, type SyncResult } from "../../src/lib/sync/engine"
import { listOpenShifts } from "../../src/lib/sync/shifts"
import type { LocalShiftRow } from "../../src/db/schema"
import { varianceSeverity, type VarianceSeverity } from "../../src/lib/shifts/variance"
import { useTheme } from "../../src/theme/useTheme"
import type { Theme } from "../../src/theme/tokens"
import { Button, Card, Screen, StatusBadge, SyncBanners, SyncStatusBar, type BadgeStatus } from "../../src/components"

const OFFLINE_EDITION = env.EXPO_PUBLIC_OFFLINE_MODE

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
  const { activeShift, loaded, error, loadActiveShift, clockIn, clockOut, forceCloseShift } = useShiftStore()
  const currentStaff = useStaffStore((st) => st.current)
  const progress = useSyncStore((st) => st.progress)

  const [openingFloatInput, setOpeningFloatInput] = useState("")
  const [closingCashInput, setClosingCashInput] = useState("")
  const [showClosingForm, setShowClosingForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ shift: ShiftResponse; variance: number | null } | null>(null)
  // R1 rule 5: clock-out forces an upload; null = not started / not applicable.
  const [upload, setUpload] = useState<"running" | SyncResult | null>(null)
  // Bumped after a force-close so the open-shift list re-reads SQLite.
  const [closedVersion, setClosedVersion] = useState(0)

  useEffect(() => {
    loadActiveShift()
  }, [loadActiveShift, currentStaff?.id])

  const canCloseOthers = !OFFLINE_EDITION && staffCan(currentStaff, "shifts.close_others")
  // Other people's shifts still open on this phone (manager force-close).
  const otherOpen: LocalShiftRow[] = useMemo(
    () => (canCloseOthers ? listOpenShifts().filter((sh) => sh.cashierId !== currentStaff?.id) : []),
    [canCloseOthers, currentStaff?.id, activeShift?.id, result, closedVersion], // eslint-disable-line react-hooks/exhaustive-deps
  )

  async function runUpload() {
    setUpload("running")
    setUpload(await syncNow("clock-out", { force: true }))
  }

  function confirmForceClose(sh: LocalShiftRow) {
    Alert.alert(
      `Close ${sh.cashierName ?? "this"}'s shift?`,
      "Use this when they forgot to clock out. No cash count is recorded — it's marked as force-closed by you.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Force close",
          style: "destructive",
          onPress: async () => {
            if (await forceCloseShift(sh.clientId)) {
              setClosedVersion((v) => v + 1)
              scheduleSoonSync()
            }
          },
        },
      ],
    )
  }

  async function handleClockIn() {
    setFormError(null)
    const value = Number(openingFloatInput)
    // Online build: shifts belong to the device + current staff, no branch needed.
    if (OFFLINE_EDITION && !branchId) {
      setFormError("Session still loading — try again in a moment")
      return
    }
    if (!openingFloatInput || Number.isNaN(value) || value < 0) {
      setFormError("Enter a valid opening float")
      return
    }
    setPending(true)
    try {
      await clockIn(value, branchId ?? "")
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
        if (!OFFLINE_EDITION) void runUpload()
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
          {OFFLINE_EDITION ? null : (
            <Text style={styles.hint}>Counted on this phone: closing − (float + cash sales). The server confirms it after sync.</Text>
          )}
        </Card>
        {upload === "running" ? (
          <Card style={styles.resultCard}>
            <Text style={styles.label}>{progress?.label ?? "Uploading…"}</Text>
          </Card>
        ) : upload && upload.ok ? (
          <Card style={styles.resultCard}>
            <Text style={[styles.label, { color: theme.green }]}>All synced ✓</Text>
          </Card>
        ) : upload ? (
          <Card style={styles.resultCard}>
            <Text style={styles.error}>
              {upload.outcome === "offline" ? "No connection — the shift and its sales are saved on this phone." : upload.message ?? "Couldn't upload everything."}
            </Text>
            <Button title="Try again" variant="secondary" onPress={() => void runUpload()} />
          </Card>
        ) : null}
        <Button
          title={upload && upload !== "running" && !upload.ok ? "Close now, sync later" : "Done"}
          onPress={() => {
            setResult(null)
            setUpload(null)
          }}
          disabled={upload === "running"}
          style={styles.doneButton}
        />
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

  const syncHeader = OFFLINE_EDITION ? null : (
    <>
      <SyncStatusBar />
      <SyncBanners />
    </>
  )

  const othersCard =
    canCloseOthers && otherOpen.length > 0 ? (
      <Card style={styles.shiftCard}>
        <Text style={styles.sectionTitle}>Other open shifts on this phone</Text>
        {otherOpen.map((sh) => (
          <View key={sh.clientId} style={styles.otherRow}>
            <View style={styles.flex}>
              <Text style={styles.label}>{sh.cashierName ?? "Staff"}</Text>
              <Text style={styles.subtitle}>since {formatTime(new Date(sh.openedAt).toISOString())}</Text>
            </View>
            <Button title="Force close" variant="danger" onPress={() => confirmForceClose(sh)} />
          </View>
        ))}
      </Card>
    ) : null

  if (!OFFLINE_EDITION && !currentStaff) {
    return (
      <Screen style={styles.container}>
        {syncHeader}
        <Card style={styles.shiftCard}>
          <Text style={styles.label}>Choose who is selling on this phone first.</Text>
          <Button title="Choose staff" onPress={() => router.push("/switch-user")} />
        </Card>
      </Screen>
    )
  }

  if (activeShift) {
    return (
      <Screen style={styles.container}>
        {syncHeader}
        <View style={styles.headerRow}>
          <Text style={styles.title}>Current shift</Text>
          <Pressable onPress={() => router.push("/shift-history")} hitSlop={8} style={styles.historyLink}>
            <Ionicons name="time-outline" size={16} color={theme.textSecondary} />
            <Text style={styles.historyLinkText}>History</Text>
          </Pressable>
        </View>
        <Card style={styles.shiftCard}>
          <Text style={styles.label}>Opening float: {formatKES(Math.round(activeShift.openingFloat * 100))}</Text>
          <Text style={styles.label}>Clocked in at: {formatTime(activeShift.clockedInAt)}</Text>
          {currentStaff ? <Text style={styles.subtitle}>{currentStaff.name}</Text> : null}
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
        {othersCard}
      </Screen>
    )
  }

  return (
    <Screen style={styles.container}>
      <ScrollView contentContainerStyle={styles.container}>
        {syncHeader}
        <View style={styles.headerRow}>
          <Text style={styles.title}>Clock in</Text>
          <Pressable onPress={() => router.push("/shift-history")} hitSlop={8} style={styles.historyLink}>
            <Ionicons name="time-outline" size={16} color={theme.textSecondary} />
            <Text style={styles.historyLinkText}>History</Text>
          </Pressable>
        </View>
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
        {othersCard}
      </ScrollView>
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { gap: 12 },
    centered: { alignItems: "center", justifyContent: "center", gap: 8 },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    historyLink: { flexDirection: "row", alignItems: "center", gap: 4 },
    historyLinkText: { fontSize: 13, fontWeight: "600", color: theme.textSecondary },
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
    hint: { fontSize: 12, color: theme.textSecondary },
    sectionTitle: { fontSize: 15, fontWeight: "700", color: theme.text },
    otherRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 56 },
    flex: { flex: 1 },
  })
}
