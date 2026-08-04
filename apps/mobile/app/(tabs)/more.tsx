import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { signOut } from "../../src/lib/auth-client"
import { useSessionStore } from "../../src/store/session"
import { useTheme } from "../../src/theme/useTheme"
import type { Theme } from "../../src/theme/tokens"
import { Card, EmptyState, Screen } from "../../src/components"

// Mirrors the role gates enforced server-side for each area (verified against
// the actual API routes, not from memory): staff and reports are owner/manager
// only; the catalogue screens (products/categories/suppliers) also allow
// pharmacist. This screen only hides menu entries a role can't use — the
// destination screens re-check on their own writes too, same as web.
interface MenuItem {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  href: "/staff" | "/reports" | "/products" | "/categories" | "/suppliers"
  roles: string[]
}

const MENU_ITEMS: MenuItem[] = [
  { label: "Staff", icon: "people-outline", href: "/staff", roles: ["owner", "manager"] },
  { label: "Reports", icon: "bar-chart-outline", href: "/reports", roles: ["owner", "manager"] },
  { label: "Products", icon: "medkit-outline", href: "/products", roles: ["owner", "manager", "pharmacist"] },
  { label: "Categories", icon: "folder-outline", href: "/categories", roles: ["owner", "manager", "pharmacist"] },
  { label: "Suppliers", icon: "business-outline", href: "/suppliers", roles: ["owner", "manager", "pharmacist"] },
]

export default function More() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { role } = useSessionStore()

  const visibleItems = MENU_ITEMS.filter((item) => role && item.roles.includes(role))

  // The only sign-out affordance before this was a small icon in the POS
  // header — easy to miss, and it didn't even navigate anywhere after
  // clearing the session (fixed separately in pos.tsx). This one is visible
  // to every role, not just the ones with admin menu items above.
  function handleSignOut() {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          await signOut()
          router.replace("/login")
        },
      },
    ])
  }

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
          <Pressable onPress={handleSignOut}>
            <View style={styles.row}>
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
