import { Text } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useSessionStore } from "../src/store/session"
import { useTheme } from "../src/theme/useTheme"
import { Screen, ScreenHeader, EmptyState } from "../src/components"

export default function Reports() {
  const theme = useTheme()
  const { role } = useSessionStore()

  if (role && !["owner", "manager"].includes(role)) {
    return (
      <Screen>
        <ScreenHeader title="Reports" />
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
          message="Only owners and managers can view reports."
        />
      </Screen>
    )
  }

  return (
    <Screen>
      <ScreenHeader title="Reports" />
      <Text>Coming soon</Text>
    </Screen>
  )
}
