import { ActivityIndicator, StyleSheet } from "react-native"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"

/** Small spinner under a paged list while the next page loads. */
export function ListFooterSpinner({ visible }: { visible: boolean }) {
  const theme = useTheme()
  if (!visible) return null
  return <ActivityIndicator style={styles.footer} color={theme.green} accessibilityLabel="Loading more" />
}

const styles = StyleSheet.create({
  footer: { paddingVertical: space.lg },
})
