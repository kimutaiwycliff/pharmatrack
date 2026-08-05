import { useEffect } from "react"
import { Tabs } from "expo-router"
import { ActivityIndicator, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useTheme } from "../../src/theme/useTheme"
import { useSessionStore } from "../../src/store/session"
import { Button, Card, SubscriptionGate } from "../../src/components"

// Mirrors the SaaS gate web enforces at the Next.js layout level
// (apps/web/app/(dashboard)/layout.tsx, apps/web/app/(pos)/layout.tsx): block
// every tab unless the org's subscription is "trialing" or "active". Web has
// no equivalent here since the RN app talks to the API directly with no
// server layout to intercept the request — see /api/mobile/me/route.ts's
// comment for why this is added client-side instead.
const ACTIVE_STATUSES = ["trialing", "active"]

// The app's first top-level tab navigator: POS + Shifts + Dashboard +
// Inventory + Appointments + More (per ADR-013's phased plan). Route groups
// don't change the URL, so /pos, /shifts, /dashboard, /inventory,
// /appointments, and /more resolve exactly as before the reorganization.
export default function TabsLayout() {
  const theme = useTheme()
  const { loaded, error, subStatus, role, contact, loadMe } = useSessionStore()

  useEffect(() => {
    loadMe()
  }, [loadMe])

  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg, padding: 16 }}>
        {error ? (
          <Card style={{ width: "100%", maxWidth: 420, alignItems: "center", gap: 12 }}>
            <Button
              title="Retry"
              variant="secondary"
              onPress={() => loadMe()}
              icon={<Ionicons name="refresh-outline" size={18} color={theme.text} />}
            />
          </Card>
        ) : (
          <ActivityIndicator color={theme.green} />
        )}
      </View>
    )
  }

  if (!subStatus || !ACTIVE_STATUSES.includes(subStatus)) {
    return <SubscriptionGate status={subStatus ?? "none"} isOwner={role === "owner"} contact={contact} />
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.green,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
      }}
    >
      <Tabs.Screen
        name="pos"
        options={{
          title: "POS",
          tabBarIcon: ({ color, size }) => <Ionicons name="storefront-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="shifts"
        options={{
          title: "Shifts",
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: "Inventory",
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          title: "Appointments",
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal-circle-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  )
}
