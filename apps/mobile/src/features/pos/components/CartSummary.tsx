import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { useEffect, useRef } from "react"
import { StyleSheet, View } from "react-native"
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated"
import { AnimatedNumber, Button, Money, PressableScale, Text } from "../../../components"
import { useMotion } from "../../../lib/motion"
import { useCartStore } from "../../../store/cart"
import { useTheme } from "../../../theme/useTheme"
import { elevation, motion, radius, space, TOUCH_TARGET } from "../../../theme/tokens"
import { cartTotals } from "../logic/cart"

/** Space the phone list reserves at its bottom so the overlaid cart bar never covers the last row. */
export const CART_BAR_SPACE = TOUCH_TARGET + 12 + space.sm * 2 + space.md

const itemsLabel = (n: number) => `${n} item${n === 1 ? "" : "s"}`

/** Subtotal / discount / total + the big Pay button (cart sheet footer, tablet panel). */
export function CartTotals({ onPay, payDisabled }: { onPay: () => void; payDisabled?: boolean }) {
  const theme = useTheme()
  const items = useCartStore((s) => s.items)
  const t = cartTotals(items)
  return (
    <View style={styles.totals}>
      {t.discount > 0 ? (
        <>
          <View style={styles.totalRow}>
            <Text tone="secondary">Subtotal</Text>
            <Money cents={t.subtotal} variant="body" tone="secondary" animate />
          </View>
          <View style={styles.totalRow}>
            <Text tone="secondary">Discount</Text>
            <Text tone="success" tabular>
              −{formatKES(t.discount)}
            </Text>
          </View>
        </>
      ) : null}
      <View style={styles.totalRow}>
        <Text variant="headline">Total · {itemsLabel(t.count)}</Text>
        <Money cents={t.total} variant="title" animate />
      </View>
      <Button
        title={`Pay ${formatKES(t.total)}`}
        size="lg"
        onPress={onPay}
        disabled={payDisabled || items.length === 0}
        leadingIcon={<Ionicons name="wallet-outline" size={22} color={theme.onAccent} />}
      />
    </View>
  )
}

/**
 * Phone: persistent bar above the tab bar — "3 items · KES 1,240" opens the
 * full cart, the big Pay button (thumb reach) goes straight to payment.
 * Motion: overlaid at the bottom of the list (no layout jump), springs up when
 * the first item lands and slides away when the cart empties; the cart badge
 * bumps on every add and the total rolls to its new value.
 */
export function CartSummaryBar({ onOpenCart, onPay }: { onOpenCart: () => void; onPay: () => void }) {
  const m = useMotion()
  const empty = useCartStore((s) => s.items.length === 0)
  if (empty) return null
  return (
    <Animated.View entering={m.slideUpIn} exiting={m.slideDownOut} style={styles.barWrap} pointerEvents="box-none">
      <CartBarBody onOpenCart={onOpenCart} onPay={onPay} />
    </Animated.View>
  )
}

function CartBarBody({ onOpenCart, onPay }: { onOpenCart: () => void; onPay: () => void }) {
  const theme = useTheme()
  const m = useMotion()
  const items = useCartStore((s) => s.items)
  const t = cartTotals(items)
  const bump = useSharedValue(1)
  const lastCount = useRef(t.count)
  useEffect(() => {
    const grew = t.count > lastCount.current
    lastCount.current = t.count
    if (!grew || m.reduced) return
    // 1 → 1.15 → 1, critically damped (no wobble).
    bump.value = withSequence(
      withTiming(1.15, { duration: motion.duration.fast, reduceMotion: ReduceMotion.Never }),
      withSpring(1, { ...motion.spring.snappy, reduceMotion: ReduceMotion.Never }),
    )
  }, [t.count, m.reduced, bump])
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }))

  return (
    <View style={[styles.bar, elevation.md, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <PressableScale
        onPress={onOpenCart}
        accessibilityRole="button"
        accessibilityLabel={`Cart, ${itemsLabel(t.count)}, total ${formatKES(t.total)}`}
        accessibilityHint="Opens the cart"
        style={({ pressed }) => [styles.barCart, pressed && { backgroundColor: theme.mutedStrong }]}
      >
        <Animated.View style={[styles.badge, { backgroundColor: theme.green50 }, badgeStyle]}>
          <Ionicons name="cart-outline" size={22} color={theme.green600} />
        </Animated.View>
        <View>
          <Text variant="label">{itemsLabel(t.count)}</Text>
          <Text variant="caption" tone="secondary">
            View cart
          </Text>
        </View>
      </PressableScale>
      <PayButton totalCents={t.total} onPay={onPay} />
    </View>
  )
}

/** The bar's Pay button with the total rolling inside it. */
function PayButton({ totalCents, onPay }: { totalCents: number; onPay: () => void }) {
  const theme = useTheme()
  return (
    <PressableScale
      onPress={onPay}
      accessibilityRole="button"
      accessibilityLabel={`Pay ${formatKES(totalCents)}`}
      style={[styles.barPay, { backgroundColor: theme.greenCta }]}
    >
      <Text variant="headline" style={{ color: theme.onAccent }}>
        Pay{" "}
      </Text>
      <AnimatedNumber value={totalCents} format={formatKES} variant="headline" tone="inverse" />
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  totals: { gap: space.sm },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  barCart: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: TOUCH_TARGET + 12, paddingHorizontal: space.sm, borderRadius: radius.lg },
  badge: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  barWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
  barPay: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 60,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
  },
})
