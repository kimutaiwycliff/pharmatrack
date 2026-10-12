import { useEffect, useState } from "react"
import { Alert, StyleSheet, View } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { useSessionStore } from "../../src/store/session"
import { useShiftStore, type ShiftResponse } from "../../src/store/shift"
import { useStaffStore } from "../../src/store/staff"
import { useSyncStore } from "../../src/store/sync"
import { env } from "../../src/lib/env"
import { formatDateTime, formatTime } from "../../src/lib/dates"
import { keypadNumber } from "../../src/lib/keypad"
import { haptics } from "../../src/lib/haptics"
import { syncNow, type SyncResult } from "../../src/lib/sync/engine"
import { useCan } from "../../src/hooks/useCan"
import { useTheme } from "../../src/theme/useTheme"
import { space } from "../../src/theme/tokens"
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormScroll,
  NumericKeypad,
  Screen,
  ScreenHeader,
  SkeletonCards,
  SyncBanners,
  SyncStatusBar,
  Text,
  TextField,
  useIsOnline,
} from "../../src/components"
import { Divider, FigureRow, VarianceSummary } from "../../src/features/shifts/components/Figures"
import { OtherOpenShifts } from "../../src/features/shifts/components/OtherOpenShifts"

// Till session for whoever is selling on this phone. Online build (R1 rule 5):
// shifts are device-local (lib/sync/shifts.ts via store/shift.ts) and upload as
// shift_open / shift_close outbox items, so clock-in and clock-out work with no
// connection; clock-out then forces an upload. Offline Edition (ADR-014): the
// local shifts table in repo/sales.ts. R3: keypad cash entry (never a float,
// and no system keyboard over the figures), expected-vs-counted figures with
// Balanced / Over / Short, Shift history for shifts.view_all, and managers'
// force-close of other people's open shifts on this phone and on other tills.

const OFFLINE_EDITION = env.EXPO_PUBLIC_OFFLINE_MODE

type ClosedResult = { shift: ShiftResponse; variance: number | null }

export default function Shifts() {
  const theme = useTheme()
  const can = useCan()
  const online = useIsOnline()
  const { branchId } = useSessionStore()
  const { activeShift, loaded, error, loadActiveShift, clockIn, clockOut } = useShiftStore()
  const currentStaff = useStaffStore((st) => st.current)

  const [digits, setDigits] = useState("")
  const [notes, setNotes] = useState("")
  const [closing, setClosing] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<ClosedResult | null>(null)
  // R1 rule 5: clock-out forces an upload; null = not started / not applicable.
  const [upload, setUpload] = useState<"running" | SyncResult | null>(null)

  useEffect(() => {
    loadActiveShift()
  }, [loadActiveShift, currentStaff?.id])

  const canCloseOthers = !OFFLINE_EDITION && can("shifts.close_others")
  const showHistory = online && can("shifts.view_all")
  const amountCents = keypadNumber(digits) * 100

  async function runUpload() {
    setUpload("running")
    setUpload(await syncNow("clock-out", { force: true }))
  }

  async function handleClockIn() {
    setFormError(null)
    // Online build: shifts belong to the device + current staff, no branch needed.
    if (OFFLINE_EDITION && !branchId) {
      setFormError("Session still loading — try again in a moment")
      return
    }
    setPending(true)
    try {
      await clockIn(amountCents / 100, branchId ?? "")
      setDigits("")
      haptics.success()
    } finally {
      setPending(false)
    }
  }

  async function doClockOut() {
    setPending(true)
    try {
      const out = await clockOut(amountCents / 100, notes.trim() || undefined)
      if (out) {
        haptics.success()
        setResult(out)
        setClosing(false)
        setDigits("")
        setNotes("")
        if (!OFFLINE_EDITION) void runUpload()
      }
    } finally {
      setPending(false)
    }
  }

  function handleClockOut() {
    setFormError(null)
    if (digits === "") {
      // The keypad can't type a lone 0, so an empty count is either "the
      // drawer really is empty" or a slip — ask instead of guessing.
      Alert.alert("Close with KES 0 counted?", "Nothing was entered for the cash in the drawer.", [
        { text: "Enter amount", style: "cancel" },
        { text: "Close with KES 0", style: "destructive", onPress: () => void doClockOut() },
      ])
      return
    }
    void doClockOut()
  }

  function openClosingForm() {
    setDigits("")
    setNotes("")
    setFormError(null)
    setClosing(true)
  }

  const historyButton = showHistory ? (
    <Button
      title="History"
      size="sm"
      variant="ghost"
      leadingIcon={<Ionicons name="time-outline" size={18} color={theme.text} />}
      onPress={() => router.push("/shift-history")}
      accessibilityLabel="Shift history"
    />
  ) : null

  const syncHeader = OFFLINE_EDITION ? null : (
    <>
      <SyncStatusBar />
      <SyncBanners />
    </>
  )

  const others = canCloseOthers && currentStaff ? <OtherOpenShifts currentStaffId={currentStaff.id} activeShiftId={activeShift?.id ?? null} /> : null

  if (result) {
    return (
      <Screen>
        <ScreenHeader title="Shift closed" hideBack />
        <FormScroll
          footer={
            <Button
              title={upload && upload !== "running" && !upload.ok ? "Close now, sync later" : "Done"}
              size="lg"
              onPress={() => {
                setResult(null)
                setUpload(null)
              }}
              disabled={upload === "running"}
            />
          }
        >
          <ClosedSummary result={result} />
          {OFFLINE_EDITION ? null : <UploadStatus upload={upload} onRetry={() => void runUpload()} />}
        </FormScroll>
      </Screen>
    )
  }

  if (error && !loaded) {
    return (
      <Screen>
        <ScreenHeader title="Shifts" hideBack />
        <ErrorState message={error} onRetry={() => loadActiveShift()} />
      </Screen>
    )
  }

  if (!loaded) {
    return (
      <Screen>
        <ScreenHeader title="Shifts" hideBack />
        <SkeletonCards count={2} />
      </Screen>
    )
  }

  if (!OFFLINE_EDITION && !currentStaff) {
    return (
      <Screen>
        {syncHeader}
        <ScreenHeader title="Shifts" hideBack />
        <EmptyState
          icon={<Ionicons name="person-circle-outline" size={40} color={theme.textTertiary} />}
          title="Who is selling?"
          message="Choose who is selling on this phone first, then clock in."
          action={{ label: "Choose staff", onPress: () => router.push("/switch-user") }}
        />
      </Screen>
    )
  }

  const cashEntry = (label: string, helper: string) => (
    <Card style={styles.card}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <Text variant="display" tabular accessibilityLiveRegion="polite" accessibilityLabel={`${label}: ${formatKES(amountCents)}`}>
        {formatKES(amountCents)}
      </Text>
      <Text variant="caption" tone="secondary">
        {helper}
      </Text>
      <NumericKeypad value={digits} onChange={setDigits} />
    </Card>
  )

  const formErrorText = formError || error ? (
    <Text tone="danger" accessibilityLiveRegion="polite">
      {formError ?? error}
    </Text>
  ) : null

  if (activeShift) {
    return (
      <Screen>
        {syncHeader}
        <ScreenHeader title={closing ? "End shift" : "Current shift"} hideBack right={closing ? null : historyButton} />
        <FormScroll
          footer={
            closing ? (
              <View style={styles.footer}>
                <Button title="Cancel" variant="secondary" size="lg" style={styles.flex} onPress={() => setClosing(false)} />
                <Button title="End shift" variant="danger" size="lg" style={styles.flex} loading={pending} onPress={handleClockOut} />
              </View>
            ) : (
              <Button
                title="End shift"
                variant="danger"
                size="lg"
                leadingIcon={<Ionicons name="log-out-outline" size={20} color={theme.onAccent} />}
                onPress={openClosingForm}
                accessibilityHint="Count the cash in the drawer and clock out"
              />
            )
          }
        >
          <Card style={styles.card}>
            {currentStaff ? <Text variant="headline">{currentStaff.name}</Text> : null}
            <FigureRow label="Opening float" cents={Math.round(activeShift.openingFloat * 100)} />
            <View style={styles.metaRow}>
              <Ionicons name="log-in-outline" size={18} color={theme.textSecondary} />
              <Text tone="secondary">Clocked in at {formatTime(activeShift.clockedInAt)}</Text>
            </View>
          </Card>

          {closing ? (
            <>
              {cashEntry("Cash counted in the drawer", "Count every note and coin in the till, including the opening float.")}
              <TextField label="Note (optional)" placeholder="Anything the manager should know" value={notes} onChangeText={setNotes} maxLength={1000} multiline />
              {formErrorText}
            </>
          ) : (
            others
          )}
        </FormScroll>
      </Screen>
    )
  }

  return (
    <Screen>
      {syncHeader}
      <ScreenHeader title="Clock in" subtitle={currentStaff?.name ?? null} hideBack right={historyButton} />
      <FormScroll
        footer={
          <Button
            title="Clock in"
            size="lg"
            loading={pending}
            leadingIcon={<Ionicons name="time-outline" size={20} color={theme.onAccent} />}
            onPress={() => void handleClockIn()}
            accessibilityHint={`Starts your shift with ${formatKES(amountCents)} in the drawer`}
          />
        }
      >
        <Text tone="secondary">Clock in with the opening cash float before taking sales.</Text>
        {cashEntry("Opening float", "The cash already in the drawer. Leave at KES 0 if it starts empty.")}
        {formErrorText}
        {others}
      </FormScroll>
    </Screen>
  )
}

// Float, cash taken, expected vs counted and the variance in words. Expected
// is derived from what the store returns (counted − variance) so the Offline
// Edition and the online build show the same maths.
function ClosedSummary({ result }: { result: ClosedResult }) {
  const theme = useTheme()
  const floatCents = Math.round(result.shift.opening_float * 100)
  const countedCents = result.shift.closing_cash == null ? null : Math.round(result.shift.closing_cash * 100)
  const varianceCents = result.variance == null ? null : Math.round(result.variance * 100)
  const expectedCents = countedCents != null && varianceCents != null ? countedCents - varianceCents : null
  return (
    <Card style={styles.card}>
      <View style={styles.metaRow}>
        <Ionicons name="checkmark-circle" size={28} color={theme.green} />
        <View style={styles.flex}>
          <Text variant="headline">Clocked out</Text>
          {result.shift.clocked_out_at ? (
            <Text variant="caption" tone="secondary">
              {formatDateTime(result.shift.clocked_in_at)} – {formatTime(result.shift.clocked_out_at)}
            </Text>
          ) : null}
        </View>
      </View>
      <FigureRow label="Opening float" cents={floatCents} />
      <FigureRow label="Cash sales" cents={expectedCents == null ? null : expectedCents - floatCents} />
      <Divider />
      <FigureRow label="Expected cash" cents={expectedCents} strong />
      <FigureRow label="Counted cash" cents={countedCents} strong />
      <Divider />
      <VarianceSummary varianceCents={varianceCents} />
      {OFFLINE_EDITION ? null : (
        <Text variant="caption" tone="secondary">
          Worked out on this phone. The server confirms it once the shift has synced.
        </Text>
      )}
    </Card>
  )
}

function UploadStatus({ upload, onRetry }: { upload: "running" | SyncResult | null; onRetry: () => void }) {
  const theme = useTheme()
  const progress = useSyncStore((st) => st.progress)
  if (!upload) return null
  if (upload === "running") {
    return (
      <Card style={styles.card}>
        <View style={styles.metaRow} accessibilityLiveRegion="polite">
          <Ionicons name="cloud-upload-outline" size={20} color={theme.textSecondary} />
          <Text tone="secondary">{progress?.label ?? "Uploading the shift and its sales…"}</Text>
        </View>
      </Card>
    )
  }
  if (upload.ok) {
    return (
      <Card style={styles.card}>
        <View style={styles.metaRow} accessibilityLiveRegion="polite">
          <Ionicons name="cloud-done-outline" size={20} color={theme.green} />
          <Text tone="success">All synced</Text>
        </View>
      </Card>
    )
  }
  return (
    <Card style={styles.card}>
      <Text tone="danger" accessibilityLiveRegion="polite">
        {upload.outcome === "offline"
          ? "No connection — the shift and its sales are saved on this phone and will upload when you're back online."
          : (upload.message ?? "Couldn't upload everything.")}
      </Text>
      <Button title="Try again" variant="secondary" onPress={onRetry} />
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.lg },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  footer: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
})
