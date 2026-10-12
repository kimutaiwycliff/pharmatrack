import { useEffect, useState } from "react"
import { ScrollView, StyleSheet, View } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { confirmSignOut } from "../../src/lib/auth-client"
import { listDeviceUsers } from "../../src/lib/device-users"
import { visibleMenuItems, type MenuItemDef } from "../../src/lib/nav/visibility"
import { useNavContext } from "../../src/hooks/useCan"
import { useSessionStore } from "../../src/store/session"
import { useStaffStore } from "../../src/store/staff"
import { useSyncStore } from "../../src/store/sync"
import { useTheme } from "../../src/theme/useTheme"
import { radius, space } from "../../src/theme/tokens"
import { ListRow, Screen, ScreenHeader, Text } from "../../src/components"

type IoniconName = keyof typeof Ionicons.glyphMap

const SECTIONS: MenuItemDef["section"][] = ["Selling", "Stock", "Clinical", "Insights", "Admin"]

const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", pharmacist: "Pharmacist", cashier: "Cashier" }

// R3: everything that isn't a tab, grouped and filtered by capability (see
// lib/nav/visibility.ts — the same any-of-these-capabilities + plan-feature
// rule as web's Sidebar). Items a person can't use are hidden, not disabled;
// the destination screens and the API re-check on their own anyway.
export default function More() {
  const theme = useTheme()
  const nav = useNavContext()
  const items = visibleMenuItems(nav)
  const staff = useStaffStore((s) => s.current)
  const sessionRole = useSessionStore((s) => s.role)
  const [hasDeviceUsers, setHasDeviceUsers] = useState(false)
  // R1: a registered phone switches staff from its synced roster (offline PIN).
  const deviceRegistered = useSyncStore((s) => !!s.device)
  const canSwitch = hasDeviceUsers || deviceRegistered

  useEffect(() => {
    listDeviceUsers().then((users) => setHasDeviceUsers(users.length > 0))
  }, [])

  const role = staff?.role ?? sessionRole
  const who = staff?.name ?? null

  return (
    <Screen>
      <ScreenHeader title="More" hideBack subtitle={who ? `${who}${role ? ` · ${ROLE_LABEL[role] ?? role}` : ""}` : role ? ROLE_LABEL[role] : null} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {SECTIONS.map((section) => {
          const rows = items.filter((i) => i.section === section)
          if (rows.length === 0) return null
          return (
            <View key={section} style={styles.section}>
              <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.sectionTitle}>
                {section}
              </Text>
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                {rows.map((item) => (
                  <ListRow
                    key={item.href}
                    title={item.label}
                    onPress={() => router.push(item.href)}
                    leading={<Ionicons name={item.icon as IoniconName} size={22} color={theme.text} />}
                    trailing={<Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />}
                  />
                ))}
              </View>
            </View>
          )
        })}

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {canSwitch ? (
            <ListRow
              title="Switch user"
              subtitle="Hand the phone to someone else"
              onPress={() => router.push(deviceRegistered ? "/switch-user" : "/login")}
              leading={<Ionicons name="swap-horizontal-outline" size={22} color={theme.text} />}
              trailing={<Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />}
            />
          ) : null}
          <ListRow
            title="Log out"
            onPress={confirmSignOut}
            accessibilityHint="Signs this account out of the app"
            leading={<Ionicons name="log-out-outline" size={22} color={theme.red} />}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scrollContent: { gap: space.lg, paddingBottom: space.xl },
  section: { gap: space.xs },
  sectionTitle: { marginLeft: space.xs, textTransform: "uppercase", letterSpacing: 0.5 },
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
})
