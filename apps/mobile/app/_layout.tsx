import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { useTheme } from "../src/theme/useTheme"

export default function RootLayout() {
  const theme = useTheme()
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />
      <StatusBar style="auto" />
    </>
  )
}
