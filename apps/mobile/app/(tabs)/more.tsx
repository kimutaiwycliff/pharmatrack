import { useEffect, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { hasFeature, type Feature } from "@pharmatrack/core"
import { confirmSignOut } from "../../src/lib/auth-client"
import { listDeviceUsers } from "../../src/lib/device-users"
import { useSessionStore } from "../../src/store/session"
import { useTheme } from "../../src/theme/useTheme"
import type { Theme } from "../../src/theme/tokens"
import { Card, EmptyState, Screen } from "../../src/components"

// Mirrors the role gates enforced server-side for each area (verified against
// the actual API routes, not from memory): staff and reports are owner/manager
// only; the catalogue screens (products/categories/suppliers) also allow
// pharmacist; sales (receipt lookup) is open to every role including cashier,
// same as web's Sidebar entry for it — a cashier needs to find their own past
// receipts. This screen only hides menu entries a role can't use — the
// destination screens re-check on their own writes too, same as web.
// `feature` mirrors apps/web/components/layout/Sidebar.tsx's per-item plan
// gate exactly (Products/Suppliers -> "inventory", Reports -> "reports");
// Staff, Categories, and Sales have no feature entry on web's sidebar either,
// so they stay role-only here too, rather than inventing a gate web doesn't have.
interface MenuItem {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  href: "/staff" | "/reports" | "/products" | "/categories" | "/suppliers" | "/sales" | "/billing" | "/settings"
  roles: string[]
  feature?: Feature
}

const MENU_ITEMS: MenuItem[] = [
  { label: "Sales", icon: "receipt-outline", href: "/sales", roles: ["owner", "manager", "pharmacist", "cashier"] },
  { label: "Staff", icon: "people-outline", href: "/staff", roles: ["owner", "manager"] },
  { label: "Billing", icon: "card-outline", href: "/billing", roles: ["owner"] },
  { label: "Settings", icon: "settings-outline", href: "/settings", roles: ["owner", "manager", "pharmacist", "cashier"] },
  { label: "Reports", icon: "bar-chart-outline", href: "/reports", roles: ["owner", "manager"], feature: "reports" },
  { label: "Products", icon: "medkit-outline", href: "/products", roles: ["owner", "manager", "pharmacist"], feature: "inventory" },
  { label: "Categories", icon: "folder-outline", href: "/categories", roles: ["owner", "manager", "pharmacist"] },
  { label: "Suppliers", icon: "business-outline", href: "/suppliers", roles: ["owner", "manager", "pharmacist"], feature: "inventory" },
]

export default function More() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { role, planCode } = useSessionStore()
  const [hasDeviceUsers, setHasDeviceUsers] = useState(false)

  useEffect(() => {
    listDeviceUsers().then((users) => setHasDeviceUsers(users.length > 0))
  }, [])

  const visibleItems = MENU_ITEMS.filter(
    (item) => role && item.roles.includes(role) && (!item.feature || hasFeature(planCode, item.feature)),
  )

  return (
    <Screen>
      <Text style={styles.title}>More</Text>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {visibleItems.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
            message="No admin tools available for your role"
          />
        ) : (
          <Card style={styles.listCard}>
            {visibleItems.map((item, i) => (
              <Pressable key={item.href} onPress={() => router.push(item.href)}>
                <View style={[styles.row, i > 0 && styles.rowBorder]}>
                  <Ionicons name={item.icon} size={22} color={theme.text} />
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
                </View>
              </Pressable>
            ))}
          </Card>
        )}

        <Card style={styles.listCard}>
          {hasDeviceUsers ? (
            <Pressable onPress={() => router.push("/login")}>
              <View style={styles.row}>
                <Ionicons name="swap-horizontal-outline" size={22} color={theme.text} />
                <Text style={styles.rowLabel}>Switch user</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
              </View>
            </Pressable>
          ) : null}
          <Pressable onPress={confirmSignOut}>
            <View style={[styles.row, hasDeviceUsers && styles.rowBorder]}>
              <Ionicons name="log-out-outline" size={22} color={theme.red} />
              <Text style={[styles.rowLabel, { color: theme.red }]}>Log out</Text>
            </View>
          </Pressable>
        </Card>
      </ScrollView>
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    title: { fontSize: 20, fontWeight: "700", color: theme.text, marginBottom: 12 },
    scrollContent: { gap: 12, paddingBottom: 24 },
    listCard: { paddingVertical: 4 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
    rowBorder: { borderTopWidth: 1, borderTopColor: theme.border },
    rowLabel: { flex: 1, fontSize: 16, color: theme.text },
  })
}
