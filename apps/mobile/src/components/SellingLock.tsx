import { useEffect, useState } from "react"
import { ScrollView, StyleSheet } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import Animated from "react-native-reanimated"
import { useShallow } from "zustand/react/shallow"
import { useMotion } from "../lib/motion"
import { useSyncStore } from "../store/sync"
import { syncNow } from "../lib/sync/engine"
import { performOverride } from "../lib/sync/override"
import { listRoster, type RosterMember } from "../lib/sync/roster"
import { lockMessage } from "../lib/sync/core/lock"
import { nairobiClock } from "../lib/sync/core/format"
import { toast } from "../lib/toast"
import { useTheme } from "../theme/useTheme"
import { space } from "../theme/tokens"
import { Button } from "./Button"
import { Card } from "./Card"
import { ListRow } from "./ListRow"
import { useShake } from "./Motion"
import { PinEntry } from "./PinEntry"
import { Text } from "./Text"

// Shown instead of the POS while selling is locked (R1 rules 3 + 4): missed
// midnight sync, an expired manager unlock, a phone that has never synced, or
// a clock that was wound back. Always offers "Sync now"; after a missed
// deadline (until 12:00) a manager with sync.override can unlock with a PIN.
// Motion: the lock icon gives one shake when the screen appears; the manager
// list and PIN step fade in/out between stages.
export function SellingLock() {
  const theme = useTheme()
  const m = useMotion()
  const { lock, status, pendingSales, lastError, online } = useSyncStore(
    useShallow((s) => ({ lock: s.lock, status: s.status, pendingSales: s.pendingSales, lastError: s.lastError, online: s.online })),
  )
  const [managers, setManagers] = useState<RosterMember[] | null>(null)
  const [picked, setPicked] = useState<RosterMember | null>(null)
  const { style: shakeStyle, shake } = useShake()
  useEffect(() => {
    const t = setTimeout(() => shake(false), 180)
    return () => clearTimeout(t)
  }, [shake])

  if (!lock.reason) return null
  const syncing = status === "syncing"

  async function onSync() {
    const r = await syncNow("lock-screen", { force: true })
    if (r.ok) toast.success("Synced — selling unlocked")
    else if (r.outcome === "offline") toast.error("Still offline — check the connection")
    else if (r.message) toast.error(r.message)
  }

  function startOverride() {
    setManagers(listRoster().filter((m) => m.isActive && m.hasPin && m.permissions.includes("sync.override")))
  }

  async function submitPin(pin: string): Promise<string | null> {
    if (!picked) return "Pick a manager"
    const r = await performOverride(picked.id, pin)
    if (!r.ok) return r.error
    toast.success(`Unlocked until ${nairobiClock(r.until)}`)
    setPicked(null)
    setManagers(null)
    return null
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <Card style={styles.card}>
        <Animated.View style={shakeStyle}>
          <Ionicons name={lock.reason === "clock_changed" ? "time-outline" : "lock-closed-outline"} size={44} color={theme.red} />
        </Animated.View>
        <Text variant="title" align="center" accessibilityRole="header">
          Selling is locked
        </Text>
        <Text align="center">{lockMessage(lock.reason)}</Text>
        {pendingSales > 0 ? (
          <Text variant="caption" tone="secondary" align="center">
            {pendingSales} sale{pendingSales === 1 ? "" : "s"} waiting to upload
          </Text>
        ) : null}
        {!online ? (
          <Text variant="caption" tone="secondary" align="center">
            This phone is offline
          </Text>
        ) : null}
        {lastError ? (
          <Text variant="caption" tone="danger" align="center" accessibilityLiveRegion="polite">
            {lastError}
          </Text>
        ) : null}
        <Button
          title={syncing ? "Syncing…" : "Sync now"}
          onPress={onSync}
          loading={syncing}
          leadingIcon={<Ionicons name="sync-outline" size={18} color={theme.onAccent} />}
          style={styles.fullWidth}
        />
        {lock.overrideAvailable && !managers ? (
          <Button
            title="Manager override"
            variant="secondary"
            onPress={startOverride}
            leadingIcon={<Ionicons name="key-outline" size={18} color={theme.text} />}
            style={styles.fullWidth}
          />
        ) : null}
      </Card>

      {managers && !picked ? (
        <Animated.View key="managers" entering={m.riseIn} exiting={m.fadeOut}>
        <Card style={styles.pickCard}>
          <Text variant="bodyStrong" style={styles.pickTitle}>
            Unlock until {lock.overrideUntil ? nairobiClock(lock.overrideUntil) : "12:00"} — who is unlocking?
          </Text>
          {managers.length === 0 ? (
            <Text variant="caption" tone="secondary" align="center" style={styles.pickTitle}>
              No one on this phone&apos;s staff list can unlock it. Sync to refresh the list.
            </Text>
          ) : (
            managers.map((m) => (
              <ListRow
                key={m.id}
                title={m.name}
                subtitle={m.role}
                onPress={() => setPicked(m)}
                accessibilityLabel={`${m.name}, ${m.role}`}
                accessibilityHint="Enter their PIN next"
                leading={<Ionicons name="person-circle-outline" size={32} color={theme.textSecondary} />}
                trailing={<Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />}
              />
            ))
          )}
          <Button title="Cancel" variant="secondary" onPress={() => setManagers(null)} style={styles.cancel} />
        </Card>
        </Animated.View>
      ) : null}

      {picked ? (
        <Animated.View key="pin" entering={m.riseIn} exiting={m.fadeOut}>
          <PinEntry
            title={`${picked.name}'s PIN`}
            subtitle="Selling unlocks until 12:00 today. This is recorded for the owner."
            submitLabel="Unlock selling"
            onSubmit={submitPin}
            onCancel={() => setPicked(null)}
          />
        </Animated.View>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, paddingVertical: space.sm },
  card: { gap: space.sm + 2, alignItems: "center" },
  fullWidth: { alignSelf: "stretch" },
  pickCard: { gap: space.xs, paddingHorizontal: 0 },
  pickTitle: { paddingHorizontal: space.md, paddingBottom: space.xs },
  cancel: { marginHorizontal: space.md, marginTop: space.sm },
})
