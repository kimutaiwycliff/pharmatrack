import { useState } from "react"
import { StyleSheet, Text, TextInput } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useSessionStore } from "../store/session"
import { useSyncStore } from "../store/sync"
import { registerDevice } from "../lib/sync/device"
import { refreshSyncState } from "../lib/sync/engine"
import { toast } from "../lib/toast"
import { useTheme } from "../theme/useTheme"
import type { Theme } from "../theme/tokens"
import { Button } from "./Button"
import { Card } from "./Card"

// R1 rule 1 — selling needs a registered phone. A manager/owner signed in
// online (devices.manage, from /api/mobile/me) registers it here once; anyone
// else gets a clear blocking message and a way to hand the phone to a manager.
// Also covers a phone whose registration was revoked on the web.
export function DeviceGate() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { permissions, stale } = useSessionStore()
  const { status, online } = useSyncStore()
  const revoked = status === "revoked"
  const canRegister = permissions.includes("devices.manage") && !stale
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
      const r = await registerDevice(name)
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

  return (
    <Card style={styles.card}>
      <Ionicons name="phone-portrait-outline" size={44} color={revoked ? theme.red : theme.textSecondary} />
      <Text style={styles.title}>{revoked ? "This phone was removed" : "Register this phone to sell"}</Text>
      {canRegister ? (
        <>
          <Text style={styles.message}>
            {revoked
              ? "It was removed from the pharmacy's devices. Register it again to keep selling — sales waiting on it will still upload."
              : "Each phone that sells gets its own share of stock, so it can keep selling offline without ever selling more than you have."}
          </Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Phone name"
            placeholderTextColor={theme.textTertiary}
            maxLength={60}
            accessibilityLabel="Phone name"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!online ? <Text style={styles.error}>Connect to the internet to register</Text> : null}
          <Button
            title="Register this device"
            onPress={onRegister}
            loading={pending}
            disabled={!online}
            icon={<Ionicons name="checkmark-circle-outline" size={18} color="#fff" />}
            style={styles.fullWidth}
          />
        </>
      ) : (
        <>
          <Text style={styles.message}>Ask a manager to register this phone</Text>
          <Text style={styles.meta}>A manager or owner signs in on this phone once, while online, to register it.</Text>
          <Button
            title="Sign in as manager"
            onPress={() => router.push("/login")}
            icon={<Ionicons name="log-in-outline" size={18} color="#fff" />}
            style={styles.fullWidth}
          />
        </>
      )}
    </Card>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: { gap: 12, alignItems: "center" },
    fullWidth: { alignSelf: "stretch" },
    title: { fontSize: 20, fontWeight: "700", color: theme.text, textAlign: "center" },
    message: { fontSize: 15, color: theme.text, textAlign: "center" },
    meta: { fontSize: 13, color: theme.textSecondary, textAlign: "center" },
    error: { fontSize: 13, color: theme.red, textAlign: "center" },
    input: {
      alignSelf: "stretch",
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      minHeight: 48,
      paddingHorizontal: 12,
      fontSize: 16,
      backgroundColor: theme.surface,
      color: theme.text,
    },
  })
}
