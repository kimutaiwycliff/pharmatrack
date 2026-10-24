import { useCallback, useEffect, useRef, useState } from "react"
import { StyleSheet, View } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { formatPairingCode } from "@pharmatrack/core"
import { env } from "../src/lib/env"
import { adoptDeviceKey } from "../src/lib/sync/device"
import { refreshSyncState } from "../src/lib/sync/engine"
import { useDeviceApprovalStore } from "../src/store/deviceApproval"
import { useTheme } from "../src/theme/useTheme"
import { radius, space } from "../src/theme/tokens"
import { Button, Chip, FormScroll, Screen, ScreenHeader, Text, TextField } from "../src/components"

// ADR-018 — this phone tried to sign in, but the pharmacy only allows
// approved devices. An owner or manager approves it here with their till PIN,
// or from Settings → Devices after checking the code. Polls and continues by
// itself. Phones are always approved as selling tills.

interface Context {
  pharmacy: string
  suggested_name: string
  default_branch_id: string | null
  branches: { id: string; name: string }[]
  approvers: { id: string; name: string; role: string }[]
}
interface ApprovedDevice { id: string; name: string; code: string; branch_id: string; branch_name: string | null }

type Phase = "pending" | "approved" | "declined" | "expired"
const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", pharmacist: "Pharmacist", cashier: "Cashier" }

async function post<T>(path: string, body: unknown): Promise<{ ok: boolean; body: T }> {
  const res = await fetch(`${env.EXPO_PUBLIC_API_URL}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-pt-platform": "android" }, body: JSON.stringify(body),
  })
  return { ok: res.ok, body: (await res.json().catch(() => ({}))) as T }
}

export default function DeviceApproval() {
  const theme = useTheme()
  const request = useDeviceApprovalStore((s) => s.request)
  const retry = useDeviceApprovalStore((s) => s.retry)
  const clear = useDeviceApprovalStore((s) => s.clear)
  const [phase, setPhase] = useState<Phase>("pending")
  const [ctx, setCtx] = useState<Context | null>(null)
  const [mode, setMode] = useState<"here" | "remote">("here")
  const [secondsLeft, setSecondsLeft] = useState(0)
  const finishing = useRef(false)

  const back = useCallback(() => {
    clear()
    router.replace("/login")
  }, [clear])

  const finish = useCallback(async (device: ApprovedDevice) => {
    if (finishing.current || !request) return
    finishing.current = true
    setPhase("approved")
    // The approval secret is now this phone's device key.
    await adoptDeviceKey(request.secret, {
      id: device.id, name: device.name, code: device.code, branchId: device.branch_id, branchName: device.branch_name,
    })
    refreshSyncState()
    const again = retry
    clear()
    if (again) await again()
    else router.replace("/login")
  }, [request, retry, clear])

  const poll = useCallback(async () => {
    if (!request || finishing.current) return
    try {
      const r = await post<{ status?: string; context?: Context; device?: ApprovedDevice }>("/api/device-pairing/status", { secret: request.secret, platform: "android" })
      if (r.body.status === "pending" && r.body.context) setCtx(r.body.context)
      else if (r.body.status === "approved" && r.body.device) await finish(r.body.device)
      else if (r.body.status === "declined") setPhase("declined")
      else if (r.body.status) setPhase("expired")
    } catch {
      // no connection for a moment — keep trying
    }
  }, [request, finish])

  useEffect(() => {
    if (phase !== "pending") return
    const first = setTimeout(() => void poll(), 0)
    const t = setInterval(() => void poll(), 3000)
    return () => { clearTimeout(first); clearInterval(t) }
  }, [poll, phase])

  useEffect(() => {
    if (!request) return
    const tick = () => setSecondsLeft(Math.max(0, Math.floor((new Date(request.expires_at).getTime() - Date.now()) / 1000)))
    const first = setTimeout(tick, 0)
    const t = setInterval(tick, 1000)
    return () => { clearTimeout(first); clearInterval(t) }
  }, [request])

  if (!request) {
    return (
      <Screen>
        <ScreenHeader title="Device approval" onBack={back} />
        <FormScroll><Text tone="secondary">Nothing to approve. Sign in again.</Text><Button title="Back to sign in" onPress={back} /></FormScroll>
      </Screen>
    )
  }

  const shownPhase: Phase = phase === "pending" && secondsLeft === 0 && ctx ? "expired" : phase
  const noApprovers = !!ctx && ctx.approvers.length === 0
  const shownMode = noApprovers ? "remote" : mode

  if (shownPhase !== "pending") {
    const ok = shownPhase === "approved"
    return (
      <Screen>
        <FormScroll>
          <View style={styles.center} accessibilityLiveRegion="polite">
            <Ionicons name={ok ? "checkmark-circle" : "close-circle-outline"} size={52} color={ok ? theme.green : theme.textTertiary} />
            <Text variant="headline" align="center">
              {ok ? "Phone approved" : shownPhase === "declined" ? "Approval was declined" : "The approval request expired"}
            </Text>
            <Text tone="secondary" align="center">
              {ok ? "Signing you in…" : shownPhase === "declined" ? "Ask the owner or a manager if this phone should be allowed." : "Sign in again to get a new code."}
            </Text>
            {!ok && <Button title="Back to sign in" onPress={back} style={styles.full} />}
          </View>
        </FormScroll>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScreenHeader title="Needs approval" onBack={back} />
      <FormScroll>
        <Text tone="secondary">
          {ctx ? `${ctx.pharmacy} only lets staff use approved devices.` : "Your pharmacy only lets staff use approved devices."} Ask the owner or a manager to approve this phone.
        </Text>
        <View style={[styles.codeBox, { backgroundColor: theme.muted, borderColor: theme.border }]}>
          <Text variant="caption" tone="secondary">Approval code</Text>
          <Text variant="display" style={styles.code} accessibilityLabel={`Approval code ${request.code.split("").join(" ")}`}>{formatPairingCode(request.code)}</Text>
          <Text variant="caption" tone="tertiary">Expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</Text>
        </View>
        <View style={styles.row}>
          <Chip label="Approve here" selected={shownMode === "here"} disabled={noApprovers} onPress={() => setMode("here")} />
          <Chip label="From their phone" selected={shownMode === "remote"} onPress={() => setMode("remote")} />
        </View>
        {shownMode === "here" && ctx
          ? <ApproveHere ctx={ctx} secret={request.secret} onApproved={(d) => void finish(d)} />
          : (
            <View style={styles.steps}>
              {noApprovers && <Text tone="secondary">No owner or manager has a till PIN set yet, so approve from their phone or computer:</Text>}
              <Text>1. The owner or a manager opens Settings → Devices.</Text>
              <Text>2. Under “Waiting for approval”, they check the code matches and tap Approve.</Text>
              <Text tone="success">Waiting — this screen continues by itself.</Text>
            </View>
          )}
      </FormScroll>
    </Screen>
  )
}

function ApproveHere({ ctx, secret, onApproved }: { ctx: Context; secret: string; onApproved: (d: ApprovedDevice) => void }) {
  const [approver, setApprover] = useState(ctx.approvers[0]?.id ?? "")
  const [name, setName] = useState(ctx.suggested_name === "Android phone" ? "" : ctx.suggested_name)
  const [branch, setBranch] = useState(ctx.default_branch_id ?? ctx.branches[0]?.id ?? "")
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const approverName = ctx.approvers.find((a) => a.id === approver)?.name ?? "Approver"

  async function submit() {
    if (name.trim().length < 2) { setError("Name this phone, e.g. Counter phone"); return }
    if (pin.length < 4) { setError("Enter the 4-digit PIN"); return }
    setBusy(true)
    setError(null)
    try {
      const r = await post<{ error?: string; device?: ApprovedDevice }>("/api/device-pairing/approve-pin", {
        secret, approver_id: approver, pin, name: name.trim(), branch_id: branch, purpose: "till", platform: "android",
      })
      if (!r.ok || !r.body.device) {
        setError(r.body.error ?? "Couldn't approve this phone.")
        setPin("")
        return
      }
      onApproved(r.body.device)
    } catch {
      setError("No internet connection. Approving a phone needs to be online once.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.form}>
      <Text variant="label">Who is approving?</Text>
      <View style={styles.row}>
        {ctx.approvers.map((a) => (
          <Chip key={a.id} label={`${a.name} · ${ROLE_LABEL[a.role] ?? a.role}`} selected={approver === a.id} onPress={() => setApprover(a.id)} />
        ))}
      </View>
      <TextField label="Name this phone" placeholder="e.g. Counter phone" value={name} onChangeText={setName} maxLength={60} />
      {ctx.branches.length > 1 && (
        <>
          <Text variant="label">Branch</Text>
          <View style={styles.row}>
            {ctx.branches.map((b) => <Chip key={b.id} label={b.name} selected={branch === b.id} onPress={() => setBranch(b.id)} />)}
          </View>
        </>
      )}
      <TextField
        label={`${approverName}'s till PIN`}
        value={pin}
        onChangeText={(v) => setPin(v.replace(/\D/g, ""))}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        error={error}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Button title="Approve this phone" onPress={submit} loading={busy} />
      <Text variant="caption" tone="tertiary">Approved phones sell as tills and work offline.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: "center", gap: space.sm, paddingVertical: space.xl },
  full: { alignSelf: "stretch", marginTop: space.md },
  codeBox: { alignItems: "center", gap: space.xs, padding: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, marginVertical: space.md },
  code: { letterSpacing: 6, fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  steps: { gap: space.sm, marginTop: space.md },
  form: { gap: space.md, marginTop: space.md },
})
