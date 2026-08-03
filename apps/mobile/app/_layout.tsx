import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { useTheme } from "../src/theme/useTheme"

export default function RootLayout() {
  const theme = useTheme()
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />
      <StatusBar style="auto" />
    </SafeAreaProvider>
  )
}
