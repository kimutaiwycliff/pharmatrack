import Ionicons from "@expo/vector-icons/Ionicons"
import { StyleSheet, View } from "react-native"
import { useTheme } from "../theme/useTheme"
import { space } from "../theme/tokens"
import { Button } from "./Button"
import { Text } from "./Text"

interface ErrorStateProps {
  message: string
  onRetry?: () => void
  title?: string
  /** Inline banner above existing content instead of a full-screen block. */
  compact?: boolean
}

// R3: what every online screen shows when a load fails — the server's own
// message (lib/api.ts) plus a Retry. `compact` is for a failed refresh / next
// page while older data is still on screen.
export function ErrorState({ message, onRetry, title = "Couldn't load this", compact }: ErrorStateProps) {
  const theme = useTheme()
  if (compact) {
    return (
      <View style={[styles.banner, { backgroundColor: theme.red50, borderColor: theme.red }]} accessibilityLiveRegion="polite">
        <Ionicons name="alert-circle-outline" size={18} color={theme.red} />
        <Text variant="caption" tone="danger" style={styles.flex}>
          {message}
        </Text>
        {onRetry ? <Button title="Retry" size="sm" variant="ghost" onPress={onRetry} /> : null}
      </View>
    )
  }
  return (
    <View style={styles.block} accessibilityLiveRegion="polite">
      <Ionicons name="cloud-offline-outline" size={36} color={theme.textTertiary} />
      <Text variant="headline" align="center">
        {title}
      </Text>
      <Text tone="secondary" align="center">
        {message}
      </Text>
      {onRetry ? (
        <Button
          title="Retry"
          variant="secondary"
          onPress={onRetry}
          leadingIcon={<Ionicons name="refresh-outline" size={18} color={theme.text} />}
          style={styles.retry}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  banner: { flexDirection: "row", alignItems: "center", gap: space.sm, borderWidth: 1, borderRadius: 10, paddingLeft: space.md },
  block: { alignItems: "center", justifyContent: "center", gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  retry: { marginTop: space.sm, alignSelf: "center" },
})
