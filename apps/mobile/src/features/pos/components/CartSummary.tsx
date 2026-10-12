import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { Pressable, StyleSheet, View } from "react-native"
import { Button, Money, Text } from "../../../components"
import { useCartStore } from "../../../store/cart"
import { useTheme } from "../../../theme/useTheme"
import { elevation, radius, space, TOUCH_TARGET } from "../../../theme/tokens"
import { cartTotals } from "../logic/cart"

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
            <Money cents={t.subtotal} variant="body" tone="secondary" />
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
        <Money cents={t.total} variant="title" />
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
 */
export function CartSummaryBar({ onOpenCart, onPay }: { onOpenCart: () => void; onPay: () => void }) {
  const theme = useTheme()
  const items = useCartStore((s) => s.items)
  if (items.length === 0) return null
  const t = cartTotals(items)
  return (
    <View style={[styles.bar, elevation.md, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Pressable
        onPress={onOpenCart}
        accessibilityRole="button"
        accessibilityLabel={`Cart, ${itemsLabel(t.count)}, total ${formatKES(t.total)}`}
        accessibilityHint="Opens the cart"
        style={({ pressed }) => [styles.barCart, pressed && { backgroundColor: theme.mutedStrong }]}
      >
        <View style={[styles.badge, { backgroundColor: theme.green50 }]}>
          <Ionicons name="cart-outline" size={22} color={theme.green600} />
        </View>
        <View>
          <Text variant="label">{itemsLabel(t.count)}</Text>
          <Text variant="caption" tone="secondary">
            View cart
          </Text>
        </View>
      </Pressable>
      <Button title={`Pay ${formatKES(t.total)}`} size="lg" onPress={onPay} style={styles.barPay} />
    </View>
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
  barPay: { flex: 1 },
})
