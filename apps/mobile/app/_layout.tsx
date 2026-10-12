import * as Sentry from "@sentry/react-native"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { StyleSheet } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { ToastHost } from "../src/components"
import { useColorSchemeResolved, useTheme } from "../src/theme/useTheme"
import { initCrashReporting } from "../src/lib/crash-reporting"
import { SyncRunner } from "../src/lib/sync/SyncRunner"

// Runs once at module load, before the first render — same reasoning as
// env.ts's own module-scope validation, so an early crash is still captured.
initCrashReporting()

function RootLayout() {
  const theme = useTheme()
  const scheme = useColorSchemeResolved()
  return (
    // R2: gesture-handler root (swipe-to-remove, bottom sheets) and the sheet
    // modal host must wrap everything that can open a <Sheet>.
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          {/* R1: app-wide offline sync engine (inert in the Offline Edition). */}
          <SyncRunner />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />
          {/* Follows the in-app light/dark/system choice, not just the OS. */}
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        </BottomSheetModalProvider>
        {/* After the sheet host so toasts show above open sheets. */}
        <ToastHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})

export default Sentry.wrap(RootLayout)
