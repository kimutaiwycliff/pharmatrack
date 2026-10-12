import type { ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import { router } from "expo-router"
import { space } from "../theme/tokens"
import { IconButton } from "./IconButton"
import { Text } from "./Text"

interface ScreenHeaderProps {
  title: string
  // Screens reached via router.push from the More menu (not a bottom tab)
  // need a way back — the root Stack has headerShown: false everywhere, so
  // each such screen renders its own back affordance via this header.
  onBack?: () => void
  /** R3: tab roots have nowhere to go back to. */
  hideBack?: boolean
  subtitle?: string | null
  /** R3: actions on the right (IconButtons, a BranchSwitcher…). */
  right?: ReactNode
}

export function ScreenHeader({ title, onBack, hideBack, subtitle, right }: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      {hideBack ? null : (
        <IconButton icon="chevron-back" size={24} accessibilityLabel="Back" onPress={onBack ?? (() => router.back())} style={styles.back} />
      )}
      <View style={styles.titles}>
        <Text variant="title" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.xs, marginBottom: space.md, minHeight: 48 },
  back: { marginLeft: -space.md },
  titles: { flex: 1, gap: 0 },
  right: { flexDirection: "row", alignItems: "center", gap: space.xs },
})
