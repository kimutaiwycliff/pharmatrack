import { useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { listRoster, rosterToStaff, verifyRosterPin, type RosterMember } from "../src/lib/sync/roster"
import { switchStaff } from "../src/lib/sync/staff-session"
import { useStaffStore } from "../src/store/staff"
import { useSyncStore } from "../src/store/sync"
import { toast } from "../src/lib/toast"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Card, EmptyState, PinEntry, Screen, ScreenHeader } from "../src/components"

// Offline staff switching (R1 rule 6): pick yourself from this branch's staff
// list (downloaded by sync) and enter your PIN — checked on the phone against
// the server's bcrypt hash, no connection or cookie needed. Selling then
// happens as you (cashier_id on sales and shifts).
export default function SwitchUser() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const current = useStaffStore((s) => s.current)
  const device = useSyncStore((s) => s.device)
  const [roster] = useState<RosterMember[]>(() => listRoster().filter((m) => m.isActive && m.permissions.includes("pos.sell")))
  const [picked, setPicked] = useState<RosterMember | null>(null)

  async function submit(pin: string): Promise<string | null> {
    if (!picked) return "Pick your name"
    const r = await verifyRosterPin(picked.id, pin)
    if (!r.ok) return r.error
    await switchStaff(rosterToStaff(r.member))
    toast.success(`Selling as ${r.member.name}`)
    router.replace("/pos")
    return null
  }

  return (
    <Screen>
      <ScreenHeader title="Who's selling?" onBack={() => (router.canGoBack() ? router.back() : router.replace("/login"))} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {current ? <Text style={styles.meta}>Currently selling: {current.name}</Text> : null}
        {!device ? (
          <EmptyState
            icon={<Ionicons name="phone-portrait-outline" size={28} color={theme.textTertiary} />}
            message="This phone isn't registered yet — a manager needs to sign in online first."
          />
        ) : picked ? (
          <PinEntry
            title={`${picked.name}, enter your PIN`}
            subtitle="Works offline — checked on this phone"
            onSubmit={submit}
            onCancel={() => setPicked(null)}
          />
        ) : roster.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="people-outline" size={28} color={theme.textTertiary} />}
            message="No staff downloaded yet. Connect and sync once to get the staff list."
          />
        ) : (
          <Card style={styles.listCard}>
            {roster.map((m, i) => (
              <Pressable
                key={m.id}
                onPress={() => (m.hasPin ? setPicked(m) : toast.error(`${m.name} has no PIN yet — set one in Settings while online`))}
                style={[styles.row, i > 0 && styles.rowBorder]}
                accessibilityRole="button"
              >
                <Ionicons name="person-circle-outline" size={32} color={m.id === current?.id ? theme.green : theme.text} />
                <View style={styles.rowText}>
                  <Text style={styles.name}>{m.name}</Text>
                  <Text style={styles.meta}>
                    {m.role}
                    {m.hasPin ? "" : " · no PIN"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
              </Pressable>
            ))}
          </Card>
        )}
        <Button
          title="Sign in online instead"
          variant="secondary"
          onPress={() => router.push("/login")}
          icon={<Ionicons name="log-in-outline" size={18} color={theme.text} />}
        />
      </ScrollView>
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    scroll: { gap: 12, paddingBottom: 24 },
    listCard: { paddingVertical: 4 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60 },
    rowBorder: { borderTopWidth: 1, borderTopColor: theme.border },
    rowText: { flex: 1 },
    name: { fontSize: 16, fontWeight: "600", color: theme.text },
    meta: { fontSize: 13, color: theme.textSecondary },
  })
}
