import type { ReactNode } from "react"
import { StyleSheet, Text, View } from "react-native"
import { useTheme } from "../theme/useTheme"

interface EmptyStateProps {
  // A rendered icon element (e.g. <Ionicons name="..." size={32} color={...} />).
  icon: ReactNode
  title?: string
  message: string
}

// Centered icon + message for empty lists (e.g. "No products match your
// search", "Cart is empty") — use this anywhere a FlatList could render zero
// rows instead of leaving blank space.
export function EmptyState({ icon, title, message }: EmptyStateProps) {
  const theme = useTheme()
  return (
    <View style={styles.container}>
      {icon}
      {title ? <Text style={[styles.title, { color: theme.text }]}>{title}</Text> : null}
      <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", paddingVertical: 32, paddingHorizontal: 16, gap: 6 },
  title: { fontSize: 16, fontWeight: "600", textAlign: "center" },
  message: { fontSize: 14, textAlign: "center" },
})
