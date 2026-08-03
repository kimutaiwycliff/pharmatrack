import { Pressable, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useTheme } from "../theme/useTheme"
import type { Theme } from "../theme/tokens"

interface ScreenHeaderProps {
  title: string
  // Screens reached via router.push from the More menu (not a bottom tab)
  // need a way back — the root Stack has headerShown: false everywhere, so
  // each such screen renders its own back affordance via this header.
  onBack?: () => void
}

export function ScreenHeader({ title, onBack }: ScreenHeaderProps) {
  const theme = useTheme()
  const styles = createStyles(theme)
  return (
    <View style={styles.row}>
      <Pressable onPress={onBack ?? (() => router.back())} hitSlop={12} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={theme.text} />
      </Pressable>
      <Text style={styles.title}>{title}</Text>
    </View>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
    backButton: { padding: 4 },
    title: { fontSize: 20, fontWeight: "700", color: theme.text },
  })
}
