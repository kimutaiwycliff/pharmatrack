import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"
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
import type { Theme } from "../src/theme/tokens"
import { Button, Card, Screen } from "../src/components"

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
  const styles = createStyles(theme)
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
      <Text style={styles.title}>Checking everything</Text>
      <Card style={styles.card}>
        <Step theme={theme} state={push} label="Uploading pending sales" detail={push === "running" ? progress?.label : undefined} />
        <Step theme={theme} state={pull} label="Downloading changes" detail={pull === "running" ? progress?.label : undefined} />
        <Step theme={theme} state={verify} label="Verifying" />
        {checks.map((c) => (
          <View key={c.label} style={styles.check}>
            <Ionicons name={c.ok ? "checkmark-outline" : "alert-circle-outline"} size={16} color={c.ok ? theme.green : theme.amber} />
            <Text style={styles.checkText}>{c.label}</Text>
          </View>
        ))}
      </Card>

      {finished && result ? (
        <Card style={styles.card}>
          <Text style={styles.summary}>
            {result.productsUpdated} product{result.productsUpdated === 1 ? "" : "s"} updated, {result.deleted} deleted
            {needsAttention > 0 ? `, ${needsAttention} item${needsAttention === 1 ? "" : "s"} need${needsAttention === 1 ? "s" : ""} attention` : ""}
          </Text>
          {result.message && !result.ok ? <Text style={styles.error}>{result.message}</Text> : null}
        </Card>
      ) : null}

      {finished ? (
        <Button title="Continue" onPress={() => router.replace(nextRoute())} icon={<Ionicons name="arrow-forward" size={18} color="#fff" />} />
      ) : (
        <Button title="Skip for now" variant="secondary" onPress={() => router.replace(nextRoute())} />
      )}
      {needsAttention > 0 && finished ? (
        <Button title="See what needs attention" variant="secondary" onPress={() => router.push("/sync")} />
      ) : null}
    </Screen>
  )
}

function Step({ theme, state, label, detail }: { theme: Theme; state: StepState; label: string; detail?: string }) {
  const styles = createStyles(theme)
  return (
    <View style={styles.step}>
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
      <View style={styles.stepText}>
        <Text style={styles.stepLabel}>{label}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
    </View>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { justifyContent: "center", gap: 12 },
    title: { fontSize: 22, fontWeight: "700", color: theme.text, textAlign: "center" },
    card: { gap: 10 },
    step: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 },
    stepIcon: { width: 28, alignItems: "center" },
    stepText: { flex: 1 },
    stepLabel: { fontSize: 16, color: theme.text, fontWeight: "600" },
    detail: { fontSize: 13, color: theme.textSecondary },
    check: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 40 },
    checkText: { flex: 1, fontSize: 14, color: theme.text },
    summary: { fontSize: 15, color: theme.text },
    error: { fontSize: 14, color: theme.red },
  })
}
