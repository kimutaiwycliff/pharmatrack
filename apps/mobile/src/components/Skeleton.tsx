import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react"
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native"
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated"
import { useMotion } from "../lib/motion"
import { useTheme } from "../theme/useTheme"
import { radius, space } from "../theme/tokens"

// R3 loading placeholders: grey blocks in the shape of the content that's
// coming. One Reanimated opacity pulse (UI thread) per skeleton group — the
// blocks inside a SkeletonList/SkeletonCards share their container's pulse; a
// lone SkeletonBlock pulses by itself. Under reduced motion they sit still.
// When the real content replaces a skeleton it fades out over it (exiting
// animation), so loading → loaded reads as a crossfade, not a pop.

const PULSE_MS = 800
const PULSE_LOW = 0.45

/** True inside a container that already pulses. */
const PulseOwned = createContext(false)

function usePulseStyle(enabled: boolean) {
  const { reduced } = useMotion()
  const opacity = useSharedValue(1)
  useEffect(() => {
    if (!enabled || reduced) {
      opacity.value = 1
      return
    }
    opacity.value = withRepeat(
      withTiming(PULSE_LOW, { duration: PULSE_MS, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.Never }),
      -1,
      true,
    )
    return () => cancelAnimation(opacity)
  }, [enabled, reduced, opacity])
  return useAnimatedStyle(() => ({ opacity: opacity.value }))
}

function PulseGroup({ children, style, label = "Loading" }: { children: ReactNode; style?: StyleProp<ViewStyle>; label?: string }) {
  const m = useMotion()
  const pulse = usePulseStyle(true)
  return (
    <Animated.View
      exiting={m.fadeOut}
      style={[style, pulse]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <PulseOwned.Provider value>{children}</PulseOwned.Provider>
    </Animated.View>
  )
}

export function SkeletonBlock({ width = "100%", height = 14, style }: { width?: DimensionValue; height?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme()
  const owned = useContext(PulseOwned)
  const pulse = usePulseStyle(!owned)
  const base = useMemo(() => ({ width, height, borderRadius: radius.sm, backgroundColor: theme.mutedStrong }), [width, height, theme])
  if (owned) return <View style={[base, style]} />
  return <Animated.View style={[base, style, pulse]} />
}

/** List-shaped skeleton: `rows` rows of title + subtitle (+ a trailing figure). */
export function SkeletonList({ rows = 6, style }: { rows?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme()
  return (
    <PulseGroup style={style}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.row, { borderBottomColor: theme.border }]}>
          <View style={styles.body}>
            <SkeletonBlock width={i % 2 ? "55%" : "70%"} height={16} />
            <SkeletonBlock width="40%" height={12} />
          </View>
          <SkeletonBlock width={64} height={16} />
        </View>
      ))}
    </PulseGroup>
  )
}

/** Card grid skeleton (dashboard KPIs). */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  const theme = useTheme()
  return (
    <PulseGroup style={styles.cards}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <SkeletonBlock width="50%" height={12} />
          <SkeletonBlock width="80%" height={22} />
        </View>
      ))}
    </PulseGroup>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  body: { flex: 1, gap: space.sm },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  card: { flexGrow: 1, flexBasis: "45%", gap: space.sm, padding: space.md, borderRadius: 12, borderWidth: 1 },
})
