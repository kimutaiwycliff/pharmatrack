import { useEffect } from "react"
import { router, Tabs, useSegments } from "expo-router"
import { ActivityIndicator, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useTheme } from "../../src/theme/useTheme"
import { useSessionStore } from "../../src/store/session"
import { Button, Card, SubscriptionGate, Text } from "../../src/components"
import { useNavContext } from "../../src/hooks/useCan"
import { homeTab, TABS, visibleTabs, type TabName } from "../../src/lib/nav/visibility"

type IoniconName = keyof typeof Ionicons.glyphMap

// Mirrors the SaaS gate web enforces at the Next.js layout level
// (apps/web/app/(dashboard)/layout.tsx, apps/web/app/(pos)/layout.tsx): block
// every tab unless the org's subscription is "trialing" or "active". Web has
// no equivalent here since the RN app talks to the API directly with no
// server layout to intercept the request — see /api/mobile/me/route.ts's
// comment for why this is added client-side instead.
const ACTIVE_STATUSES = ["trialing", "active"]

// The app's top-level tab navigator: POS + Dashboard + Inventory + Shift +
// Appointments + More (per ADR-013's phased plan), filtered per person below.
// Route groups don't change the URL, so /pos, /shifts, /dashboard,
// /inventory, /appointments, and /more resolve exactly as before.
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
            <Text tone="danger" align="center">
              {error}
            </Text>
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

  return <PermissionTabs />
}

// R3: tabs come from lib/nav/visibility (capabilities + plan + edition), not
// hard-coded roles. Hidden tabs get `href: null` so they vanish from the bar;
// if the person changes (offline PIN switch) while sitting on a tab they can't
// use any more, they're moved to their home tab.
function PermissionTabs() {
  const theme = useTheme()
  const nav = useNavContext()
  const visible = visibleTabs(nav)
  const segments = useSegments() as string[]
  const current = segments[1] as TabName | undefined
  const home = homeTab(nav)

  useEffect(() => {
    if (current && TABS.some((t) => t.name === current) && !visible.includes(current)) router.replace(`/${home}`)
  }, [current, visible, home])

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Motion pass: tabs cross-fade instead of cutting.
        animation: "fade",
        tabBarActiveTintColor: theme.green,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            href: visible.includes(t.name) ? undefined : null,
            tabBarAccessibilityLabel: `${t.title} tab`,
            tabBarIcon: ({ color, size }) => <Ionicons name={t.icon as IoniconName} size={size} color={color} />,
          }}
        />
      ))}
    </Tabs>
  )
}
