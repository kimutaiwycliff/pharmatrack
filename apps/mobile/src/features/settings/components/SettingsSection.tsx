import type { ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import { Text } from "../../../components"
import { useTheme } from "../../../theme/useTheme"
import { radius, space } from "../../../theme/tokens"

// Grouped-list section (uppercase caption + rounded card of ListRows), the
// same look as the More tab so Settings reads as part of the same menu.
export function SettingsSection({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  const theme = useTheme()
  return (
    <View style={styles.section}>
      <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>{children}</View>
      {footer ? (
        <Text variant="caption" tone="tertiary" style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: space.xs },
  title: { marginLeft: space.xs, textTransform: "uppercase", letterSpacing: 0.5 },
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  footer: { marginHorizontal: space.xs },
})
