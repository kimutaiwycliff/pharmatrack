import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import Animated from "react-native-reanimated"
import { useMotion } from "../lib/motion"
import { useSessionStore } from "../store/session"
import { useSyncStore } from "../store/sync"
import { registerDevice } from "../lib/sync/device"
import { refreshSyncState } from "../lib/sync/engine"
import { toast } from "../lib/toast"
import { useTheme } from "../theme/useTheme"
import { space } from "../theme/tokens"
import { Button } from "./Button"
import { Card } from "./Card"
import { Chip } from "./Chip"
import { Text } from "./Text"
import { TextField } from "./TextField"

// R1 rule 1 — selling needs a registered phone. A manager/owner signed in
// online (devices.manage, from /api/mobile/me) registers it here once; anyone
// else gets a clear blocking message and a way to hand the phone to a manager.
// Also covers a phone whose registration was revoked on the web.
export function DeviceGate() {
  const theme = useTheme()
  const m = useMotion()
  const permissions = useSessionStore((s) => s.permissions)
  const stale = useSessionStore((s) => s.stale)
  const status = useSyncStore((s) => s.status)
  const online = useSyncStore((s) => s.online)
  const revoked = status === "revoked"
  const canRegister = permissions.includes("devices.manage") && !stale
  const branches = useSessionStore((s) => s.branches)
  const sessionBranchId = useSessionStore((s) => s.branchId)
  // A pharmacy with several branches: the phone sells for one of them. Without
  // this an owner/manager with no home branch couldn't register at all (the
  // server answers "Pick the branch this device sells for").
  const [branchId, setBranchId] = useState<string | null>(sessionBranchId ?? branches[0]?.id ?? null)
  const [name, setName] = useState("Counter phone")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onRegister() {
    setError(null)
    if (name.trim().length < 2) {
      setError("Give this phone a name, e.g. Counter phone")
      return
    }
    setPending(true)
    try {
      const r = await registerDevice(name, branches.length > 1 ? branchId : null)
      if (!r.ok) {
        setError(r.error)
        return
      }
      refreshSyncState()
      useSyncStore.setState({ status: "idle" })
      toast.success(`Registered as ${r.device.name} (${r.device.code})`)
      // The checking screen runs the first sync (with progress) right away.
      router.replace("/checking")
    } finally {
      setPending(false)
    }
  }

  // Stages (register form / ask a manager / removed) fade between each other.
  return (
    <Animated.View key={`${revoked}-${canRegister}`} entering={m.riseIn} exiting={m.fadeOut}>
    <Card style={styles.card}>
      <Ionicons name="phone-portrait-outline" size={44} color={revoked ? theme.red : theme.textSecondary} />
      <Text variant="title" align="center" accessibilityRole="header">
        {revoked ? "This phone was removed" : "Register this phone to sell"}
      </Text>
      {canRegister ? (
        <>
          <Text align="center">
            {revoked
              ? "It was removed from the pharmacy's devices. Register it again to keep selling — sales waiting on it will still upload."
              : "Each phone that sells gets its own share of stock, so it can keep selling offline without ever selling more than you have."}
          </Text>
          <TextField
            label="Phone name"
            value={name}
            onChangeText={(v) => {
              setName(v)
              if (error) setError(null)
            }}
            placeholder="e.g. Counter phone"
            maxLength={60}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (online && !pending) void onRegister()
            }}
            error={error}
            containerStyle={styles.fullWidth}
          />
          {branches.length > 1 ? (
            <View style={styles.fullWidth}>
              <Text variant="label" tone="secondary">
                Sells for
              </Text>
              <View style={styles.branches}>
                {branches.map((b) => (
                  <Chip key={b.id} label={b.name} selected={b.id === branchId} onPress={() => setBranchId(b.id)} accessibilityLabel={`Sells for ${b.name}`} />
                ))}
              </View>
            </View>
          ) : null}
          {!online ? (
            <Text variant="caption" tone="danger" align="center" accessibilityLiveRegion="polite">
              Connect to the internet to register
            </Text>
          ) : null}
          <Button
            title="Register this device"
            onPress={onRegister}
            loading={pending}
            disabled={!online}
            leadingIcon={<Ionicons name="checkmark-circle-outline" size={18} color={theme.onAccent} />}
            style={styles.fullWidth}
          />
        </>
      ) : (
        <>
          <Text align="center">Ask a manager to register this phone</Text>
          <Text variant="caption" tone="secondary" align="center">
            A manager or owner signs in on this phone once, while online, to register it.
          </Text>
          <Button
            title="Sign in as manager"
            onPress={() => router.push("/login")}
            leadingIcon={<Ionicons name="log-in-outline" size={18} color={theme.onAccent} />}
            style={styles.fullWidth}
          />
        </>
      )}
    </Card>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.md, alignItems: "center" },
  fullWidth: { alignSelf: "stretch" },
  branches: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
})
