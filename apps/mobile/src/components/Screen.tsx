import type { ReactNode } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { SafeAreaView, type Edge } from "react-native-safe-area-context"
import { useTheme } from "../theme/useTheme"

interface ScreenProps {
  children: ReactNode
  // Which sides get the device safe-area inset applied. Defaults to all four
  // so header content never overlaps the status bar/notch or home indicator.
  edges?: Edge[]
  // Extra/override styles for the inner content container (e.g. a screen
  // that wants centered content, different padding, or an extra gap).
  style?: StyleProp<ViewStyle>
}

const DEFAULT_EDGES: Edge[] = ["top", "right", "bottom", "left"]

// Every screen should render through this instead of a bare `View` — it
// pairs the themed background with proper SafeAreaView insets (from
// react-native-safe-area-context, not the deprecated react-native core one)
// and a standard content padding, so headers stop overlapping the status bar.
export function Screen({ children, edges = DEFAULT_EDGES, style }: ScreenProps) {
  const theme = useTheme()
  return (
    <SafeAreaView edges={edges} style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <View style={[styles.content, style]}>{children}</View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flex: 1, padding: 16 },
})
