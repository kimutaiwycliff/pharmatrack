import { Text } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useSessionStore } from "../src/store/session"
import { useTheme } from "../src/theme/useTheme"
import { Screen, ScreenHeader, EmptyState } from "../src/components"

export default function Products() {
  const theme = useTheme()
  const { role } = useSessionStore()

  if (role && !["owner", "manager", "pharmacist"].includes(role)) {
    return (
      <Screen>
        <ScreenHeader title="Products" />
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
          message="You don't have access to product management."
        />
      </Screen>
    )
  }

  return (
    <Screen>
      <ScreenHeader title="Products" />
      <Text>Coming soon</Text>
    </Screen>
  )
}
