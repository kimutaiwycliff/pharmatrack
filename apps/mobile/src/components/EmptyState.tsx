import type { ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import { space } from "../theme/tokens"
import { Button } from "./Button"
import { Text } from "./Text"

interface EmptyStateProps {
  // A rendered icon element (e.g. <Ionicons name="..." size={32} color={...} />).
  icon: ReactNode
  title?: string
  message: string
  /** R3: a helpful next step ("Receive stock", "Clear filters"…). */
  action?: { label: string; onPress: () => void; icon?: ReactNode }
}

// Centered icon + message for empty lists (e.g. "No products match your
// search", "Cart is empty") — use this anywhere a list could render zero
// rows instead of leaving blank space, and offer the obvious next step.
export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <View style={styles.container} accessible={!action} accessibilityRole={action ? undefined : "text"}>
      {icon}
      {title ? (
        <Text variant="bodyStrong" align="center">
          {title}
        </Text>
      ) : null}
      <Text variant="label" tone="secondary" align="center" style={styles.message}>
        {message}
      </Text>
      {action ? (
        <Button title={action.label} variant="secondary" onPress={action.onPress} leadingIcon={action.icon} style={styles.action} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", paddingVertical: 32, paddingHorizontal: 16, gap: 6 },
  message: { fontWeight: "400" },
  action: { marginTop: space.sm },
})
