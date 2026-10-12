import { useEffect, useState } from "react"
import { Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native"
import { useTheme } from "../theme/useTheme"
import { radius, space } from "../theme/tokens"

// R3 loading placeholders: grey blocks that gently pulse in the shape of the
// content that's coming, instead of a lone spinner or "Loading…".

export function SkeletonBlock({ width = "100%", height = 14, style }: { width?: DimensionValue; height?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme()
  return <View style={[{ width, height, borderRadius: radius.sm, backgroundColor: theme.mutedStrong }, style]} />
}

function usePulse() {
  const [opacity] = useState(() => new Animated.Value(1))
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])
  return opacity
}

/** List-shaped skeleton: `rows` rows of title + subtitle (+ a trailing figure). */
export function SkeletonList({ rows = 6, style }: { rows?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme()
  const opacity = usePulse()
  return (
    <Animated.View
      style={[{ opacity }, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    >
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.row, { borderBottomColor: theme.border }]}>
          <View style={styles.body}>
            <SkeletonBlock width={i % 2 ? "55%" : "70%"} height={16} />
            <SkeletonBlock width="40%" height={12} />
          </View>
          <SkeletonBlock width={64} height={16} />
        </View>
      ))}
    </Animated.View>
  )
}

/** Card grid skeleton (dashboard KPIs). */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  const theme = useTheme()
  const opacity = usePulse()
  return (
    <Animated.View style={[styles.cards, { opacity }]} accessible accessibilityRole="progressbar" accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <SkeletonBlock width="50%" height={12} />
          <SkeletonBlock width="80%" height={22} />
        </View>
      ))}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  body: { flex: 1, gap: space.sm },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  card: { flexGrow: 1, flexBasis: "45%", gap: space.sm, padding: space.md, borderRadius: 12, borderWidth: 1 },
})
