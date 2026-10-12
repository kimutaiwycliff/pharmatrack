import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, StyleSheet, View } from "react-native"
import { router } from "expo-router"
import NetInfo from "@react-native-community/netinfo"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useSyncStore } from "../src/store/sync"
import { useStaffStore } from "../src/store/staff"
import { syncNow, type SyncResult } from "../src/lib/sync/engine"
import { outboxCounts } from "../src/lib/sync/outbox"
import { getRosterMember } from "../src/lib/sync/roster"
import { adoptSignedInUser } from "../src/lib/sync/staff-session"
import { useTheme } from "../src/theme/useTheme"
import { space } from "../src/theme/tokens"
import { Button, Card, Screen, Text } from "../src/components"

// "Checking everything" (R1 rule 9) — after sign-in and on app start, while
// online: upload what's pending, download changes, then verify the phone is
// in a good state before handing over to the till. Offline (or unregistered)
// it goes straight in; the POS shows the offline banner / registration gate.

type StepState = "waiting" | "running" | "done" | "failed"

interface Check {
  label: string
  ok: boolean
}

// Unregistered phones go to the POS, which shows the registration gate.
function nextRoute(): "/pos" | "/switch-user" {
  if (!useSyncStore.getState().device) return "/pos"
  return useStaffStore.getState().current ? "/pos" : "/switch-user"
}

export default function Checking() {
  const theme = useTheme()
  const progress = useSyncStore((s) => s.progress)
  const [running, setRunning] = useState(false)
  const [final, setFinal] = useState<{ push: StepState; pull: StepState } | null>(null)
  const [verify, setVerify] = useState<StepState>("waiting")
  const [checks, setChecks] = useState<Check[]>([])
  const [result, setResult] = useState<SyncResult | null>(null)
  const started = useRef(false)

  // Step ticks follow the engine's live progress until the run settles.
  const push: StepState = final?.push ?? (progress?.phase === "pull" ? "done" : running ? "running" : "waiting")
  const pull: StepState = final?.pull ?? (progress?.phase === "pull" ? "running" : "waiting")

  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      // Signed in online but nobody chosen yet (e.g. first run after the R1
      // update): the signed-in user is the one selling.
      if (!useStaffStore.getState().current) await adoptSignedInUser()
      const net = await NetInfo.fetch()
      if (!useSyncStore.getState().device || !net.isConnected || net.isInternetReachable === false) {
        router.replace(nextRoute())
        return
      }
      setRunning(true)
      const r = await syncNow("checking")
      setResult(r)
      if (r.outcome === "offline" || r.outcome === "unregistered") {
        router.replace(nextRoute())
        return
      }
      const pulled = r.outcome === "synced" || r.outcome === "partial"
      setFinal({ push: r.outcome === "synced" ? "done" : "failed", pull: pulled ? "done" : "failed" })

      setVerify("running")
      const counts = outboxCounts()
      const me = useStaffStore.getState().current
      const list: Check[] = [
        { label: counts.pending === 0 ? "All sales uploaded" : `${counts.pending} item(s) still waiting to upload`, ok: counts.pending === 0 },
        {
          label: !me ? "Choose who is selling next" : getRosterMember(me.id) ? `${me.name} can sell on this phone` : `${me.name} isn't on this branch's staff list`,
          ok: !me || !!getRosterMember(me.id),
        },
        {
          label: r.outcome === "subscription" ? "Subscription inactive — renew to keep syncing" : r.outcome === "revoked" ? "This phone was removed — register it again" : "Subscription and device OK",
          ok: r.outcome !== "subscription" && r.outcome !== "revoked",
        },
      ]
      setChecks(list)
      setVerify(list.every((c) => c.ok) ? "done" : "failed")
    })()
  }, [])

  const finished = verify === "done" || verify === "failed"
  const needsAttention = outboxCounts().rejected

  return (
    <Screen style={styles.container}>
      <Text variant="title" align="center" accessibilityRole="header">
        Checking everything
      </Text>
      <Card style={styles.card}>
        <Step state={push} label="Uploading pending sales" detail={push === "running" ? progress?.label : undefined} />
        <Step state={pull} label="Downloading changes" detail={pull === "running" ? progress?.label : undefined} />
        <Step state={verify} label="Verifying" />
        {checks.map((c) => (
          <View key={c.label} style={styles.check} accessible accessibilityLabel={`${c.ok ? "OK" : "Needs attention"}: ${c.label}`}>
            <Ionicons name={c.ok ? "checkmark-outline" : "alert-circle-outline"} size={18} color={c.ok ? theme.green : theme.amber} />
            <Text style={styles.flex}>{c.label}</Text>
          </View>
        ))}
      </Card>

      {finished && result ? (
        <Card style={styles.card}>
          <Text accessibilityLiveRegion="polite">
            {result.productsUpdated} product{result.productsUpdated === 1 ? "" : "s"} updated, {result.deleted} deleted
            {needsAttention > 0 ? `, ${needsAttention} item${needsAttention === 1 ? "" : "s"} need${needsAttention === 1 ? "s" : ""} attention` : ""}
          </Text>
          {result.message && !result.ok ? <Text tone="danger">{result.message}</Text> : null}
        </Card>
      ) : null}

      {finished ? (
        <Button
          title="Continue"
          size="lg"
          onPress={() => router.replace(nextRoute())}
          leadingIcon={<Ionicons name="arrow-forward" size={20} color={theme.onAccent} />}
        />
      ) : (
        <Button title="Skip for now" variant="secondary" onPress={() => router.replace(nextRoute())} />
      )}
      {needsAttention > 0 && finished ? (
        <Button title="See what needs attention" variant="secondary" onPress={() => router.push("/sync")} />
      ) : null}
    </Screen>
  )
}

const STEP_STATE_LABEL: Record<StepState, string> = { waiting: "waiting", running: "in progress", done: "done", failed: "needs attention" }

function Step({ state, label, detail }: { state: StepState; label: string; detail?: string }) {
  const theme = useTheme()
  return (
    <View style={styles.step} accessible accessibilityLabel={`${label}, ${STEP_STATE_LABEL[state]}${detail ? `. ${detail}` : ""}`}>
      <View style={styles.stepIcon}>
        {state === "running" ? (
          <ActivityIndicator color={theme.green} />
        ) : (
          <Ionicons
            name={state === "done" ? "checkmark-circle" : state === "failed" ? "alert-circle" : "ellipse-outline"}
            size={24}
            color={state === "done" ? theme.green : state === "failed" ? theme.amber : theme.textTertiary}
          />
        )}
      </View>
      <View style={styles.flex}>
        <Text variant="bodyStrong">{label}</Text>
        {detail ? (
          <Text variant="caption" tone="secondary">
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { justifyContent: "center", gap: space.md },
  card: { gap: space.sm },
  flex: { flex: 1 },
  step: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48 },
  stepIcon: { width: 28, alignItems: "center" },
  check: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: 40 },
})
