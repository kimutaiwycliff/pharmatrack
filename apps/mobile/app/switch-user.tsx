import { useRef, useState } from "react"
import { StyleSheet } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { listRoster, rosterToStaff, verifyRosterPin, type RosterMember } from "../src/lib/sync/roster"
import { switchStaff } from "../src/lib/sync/staff-session"
import { useStaffStore } from "../src/store/staff"
import { useSyncStore } from "../src/store/sync"
import { toast } from "../src/lib/toast"
import { useTheme } from "../src/theme/useTheme"
import { Button, Card, EmptyState, FormScroll, ListRow, PinEntry, Screen, ScreenHeader } from "../src/components"

// Offline staff switching (R1 rule 6): pick yourself from this branch's staff
// list (downloaded by sync) and enter your PIN — checked on the phone against
// the server's bcrypt hash, no connection or cookie needed. Selling then
// happens as you (cashier_id on sales and shifts).
export default function SwitchUser() {
  const theme = useTheme()
  const current = useStaffStore((s) => s.current)
  const device = useSyncStore((s) => s.device)
  const [roster] = useState<RosterMember[]>(() => listRoster().filter((m) => m.isActive && m.permissions.includes("pos.sell")))
  const [picked, setPicked] = useState<RosterMember | null>(null)
  // Once switched we're leaving — a late second submit must not replace twice.
  const done = useRef(false)

  async function submit(pin: string): Promise<string | null> {
    if (done.current) return null
    if (!picked) return "Pick your name"
    const r = await verifyRosterPin(picked.id, pin)
    if (!r.ok) return r.error
    if (done.current) return null
    done.current = true
    try {
      await switchStaff(rosterToStaff(r.member))
    } catch (err) {
      done.current = false
      throw err
    }
    toast.success(`Selling as ${r.member.name}`)
    router.replace("/pos")
    return null
  }

  return (
    <Screen>
      <ScreenHeader
        title="Who's selling?"
        subtitle={current ? `Currently selling: ${current.name}` : null}
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/login"))}
      />
      <FormScroll>
        {!device ? (
          <EmptyState
            icon={<Ionicons name="phone-portrait-outline" size={32} color={theme.textTertiary} />}
            title="Phone not registered"
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
            icon={<Ionicons name="people-outline" size={32} color={theme.textTertiary} />}
            title="No staff list yet"
            message="No staff downloaded yet. Connect and sync once to get the staff list."
          />
        ) : (
          <Card style={styles.listCard}>
            {roster.map((m, i) => {
              const isCurrent = m.id === current?.id
              const meta = `${m.role}${m.hasPin ? "" : " · no PIN"}${isCurrent ? " · selling now" : ""}`
              return (
                <ListRow
                  key={m.id}
                  title={m.name}
                  subtitle={meta}
                  accessibilityLabel={`${m.name}, ${meta}`}
                  accessibilityHint={m.hasPin ? "Enter your PIN next" : undefined}
                  onPress={() => (m.hasPin ? setPicked(m) : toast.error(`${m.name} has no PIN yet — set one in Settings while online`))}
                  leading={<Ionicons name="person-circle-outline" size={36} color={isCurrent ? theme.green : theme.textSecondary} />}
                  trailing={<Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />}
                  style={i === roster.length - 1 ? styles.lastRow : null}
                />
              )
            })}
          </Card>
        )}
        <Button
          title="Sign in online instead"
          variant="secondary"
          onPress={() => router.push("/login")}
          leadingIcon={<Ionicons name="log-in-outline" size={18} color={theme.text} />}
        />
      </FormScroll>
    </Screen>
  )
}

const styles = StyleSheet.create({
  listCard: { padding: 0, overflow: "hidden" },
  lastRow: { borderBottomWidth: 0 },
})
