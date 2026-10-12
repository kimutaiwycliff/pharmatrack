import * as Sentry from "@sentry/react-native"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { ToastHost } from "../src/components"
import { useTheme } from "../src/theme/useTheme"
import { initCrashReporting } from "../src/lib/crash-reporting"
import { SyncRunner } from "../src/lib/sync/SyncRunner"

// Runs once at module load, before the first render — same reasoning as
// env.ts's own module-scope validation, so an early crash is still captured.
initCrashReporting()

function RootLayout() {
  const theme = useTheme()
  return (
    <SafeAreaProvider>
      {/* R1: app-wide offline sync engine (inert in the Offline Edition). */}
      <SyncRunner />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />
      <ToastHost />
      <StatusBar style="auto" />
    </SafeAreaProvider>
  )
}

export default Sentry.wrap(RootLayout)
