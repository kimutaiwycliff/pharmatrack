import type { ReactNode } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { useTheme } from "../theme/useTheme"

interface CardProps {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

// A themed surface container used to group related content (a product row,
// a cart row, a cart summary block, etc.) instead of bare Views/Pressables.
export function Card({ children, style }: CardProps) {
  const theme = useTheme()
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>{children}</View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 12 },
})
