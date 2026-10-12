import { useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useSyncStore } from "../store/sync"
import { syncNow } from "../lib/sync/engine"
import { performOverride } from "../lib/sync/override"
import { listRoster, type RosterMember } from "../lib/sync/roster"
import { lockMessage } from "../lib/sync/core/lock"
import { nairobiClock } from "../lib/sync/core/format"
import { toast } from "../lib/toast"
import { useTheme } from "../theme/useTheme"
import type { Theme } from "../theme/tokens"
import { Button } from "./Button"
import { Card } from "./Card"
import { PinEntry } from "./PinEntry"

// Shown instead of the POS while selling is locked (R1 rules 3 + 4): missed
// midnight sync, an expired manager unlock, a phone that has never synced, or
// a clock that was wound back. Always offers "Sync now"; after a missed
// deadline (until 12:00) a manager with sync.override can unlock with a PIN.
export function SellingLock() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { lock, status, pendingSales, lastError, online } = useSyncStore()
  const [managers, setManagers] = useState<RosterMember[] | null>(null)
  const [picked, setPicked] = useState<RosterMember | null>(null)

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
    <ScrollView contentContainerStyle={styles.wrap}>
      <Card style={styles.card}>
        <Ionicons name={lock.reason === "clock_changed" ? "time-outline" : "lock-closed-outline"} size={44} color={theme.red} />
        <Text style={styles.title}>Selling is locked</Text>
        <Text style={styles.message}>{lockMessage(lock.reason)}</Text>
        {pendingSales > 0 ? (
          <Text style={styles.meta}>
            {pendingSales} sale{pendingSales === 1 ? "" : "s"} waiting to upload
          </Text>
        ) : null}
        {!online ? <Text style={styles.meta}>This phone is offline</Text> : null}
        {lastError ? <Text style={styles.error}>{lastError}</Text> : null}
        <Button
          title={syncing ? "Syncing…" : "Sync now"}
          onPress={onSync}
          loading={syncing}
          icon={<Ionicons name="sync-outline" size={18} color="#fff" />}
          style={styles.fullWidth}
        />
        {lock.overrideAvailable && !managers ? (
          <Button
            title="Manager override"
            variant="secondary"
            onPress={startOverride}
            icon={<Ionicons name="key-outline" size={18} color={theme.text} />}
            style={styles.fullWidth}
          />
        ) : null}
      </Card>

      {managers && !picked ? (
        <Card style={styles.card}>
          <Text style={styles.subtitle}>
            Unlock until {lock.overrideUntil ? nairobiClock(lock.overrideUntil) : "12:00"} — who is unlocking?
          </Text>
          {managers.length === 0 ? (
            <Text style={styles.meta}>No one on this phone&apos;s staff list can unlock it. Sync to refresh the list.</Text>
          ) : (
            managers.map((m) => (
              <Pressable key={m.id} onPress={() => setPicked(m)} style={styles.person} accessibilityRole="button">
                <Ionicons name="person-circle-outline" size={28} color={theme.text} />
                <View style={styles.personText}>
                  <Text style={styles.personName}>{m.name}</Text>
                  <Text style={styles.meta}>{m.role}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
              </Pressable>
            ))
          )}
          <Button title="Cancel" variant="secondary" onPress={() => setManagers(null)} style={styles.fullWidth} />
        </Card>
      ) : null}

      {picked ? (
        <PinEntry
          title={`${picked.name}'s PIN`}
          subtitle="Selling unlocks until 12:00 today. This is recorded for the owner."
          submitLabel="Unlock selling"
          onSubmit={submitPin}
          onCancel={() => setPicked(null)}
        />
      ) : null}
    </ScrollView>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: { gap: 12, paddingVertical: 8 },
    card: { gap: 10, alignItems: "center" },
    fullWidth: { alignSelf: "stretch" },
    title: { fontSize: 20, fontWeight: "700", color: theme.text },
    subtitle: { fontSize: 15, fontWeight: "600", color: theme.text, alignSelf: "stretch" },
    message: { fontSize: 15, color: theme.text, textAlign: "center" },
    meta: { fontSize: 13, color: theme.textSecondary, textAlign: "center" },
    error: { fontSize: 13, color: theme.red, textAlign: "center" },
    person: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 56,
      alignSelf: "stretch",
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    personText: { flex: 1 },
    personName: { fontSize: 16, fontWeight: "600", color: theme.text },
  })
}
