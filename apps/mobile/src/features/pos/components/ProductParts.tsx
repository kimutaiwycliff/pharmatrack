import { toCents } from "@pharmatrack/core"
import { memo } from "react"
import { StyleSheet, View } from "react-native"
import Animated from "react-native-reanimated"
import { Chip, Money, PressableScale, Text, useFlash } from "../../../components"
import { env } from "../../../lib/env"
import { useCartStore } from "../../../store/cart"
import { useTheme } from "../../../theme/useTheme"
import { motion, radius, space, TOUCH_TARGET } from "../../../theme/tokens"
import { remainingFor } from "../logic/cart"

const OFFLINE_EDITION = env.EXPO_PUBLIC_OFFLINE_MODE

/** "Rx" / "Controlled" badges. */
export function ClinicalBadges({ requiresPrescription, isControlled }: { requiresPrescription: boolean; isControlled: boolean }) {
  if (!requiresPrescription && !isControlled) return null
  return (
    <View style={styles.badges}>
      {isControlled ? <Chip label="Controlled" tone="danger" /> : null}
      {requiresPrescription && !isControlled ? <Chip label="Rx" tone="warning" /> : null}
    </View>
  )
}

/** "12 left" / "None left on this device" (what the till can still sell, after the cart). */
export function leftLabel(left: number): string {
  if (left > 0) return `${left} left`
  return OFFLINE_EDITION ? "Out of stock" : "None left on this device"
}

export interface ProductTileData {
  productId: string
  name: string
  strength: string | null
  genericName: string | null
  brandName: string | null
  baseUnit: string
  sellingPrice: number
  requiresPrescription: boolean
  isControlled: boolean
  /** What this till may sell before the cart is counted. */
  sellable: number
}

interface RowProps<P extends ProductTileData> {
  product: P
  /** Stable callback (useCallback in the screen) so memo holds; resolves true when added. */
  onAdd: (product: P) => Promise<boolean> | boolean | void
}

/**
 * Base units still sellable once the cart is counted. Each row subscribes to
 * just this number, so adding one product re-renders only that product's row
 * (no FlashList extraData churn on every cart change).
 */
function useLeft(productId: string, sellable: number): number {
  return useCartStore((s) => remainingFor(s.items, productId, sellable))
}

/**
 * Press → add → brief green flash on success (opacity only, UI thread).
 * Returns the add's promise so PressableScale ignores this row while a slow
 * allowance top-up is in flight (a plain add settles at once).
 */
function useAddPress<P extends ProductTileData>(product: P, onAdd: RowProps<P>["onAdd"]) {
  const { style, flash } = useFlash()
  const onPress = () =>
    Promise.resolve(onAdd(product)).then((ok) => {
      if (ok !== false) flash()
    })
  return { flashStyle: style, onPress }
}

// One search result: big tap target with everything a cashier checks before
// adding — name + strength, price per base unit, how many are left, Rx flags.
function ProductResultRowImpl<P extends ProductTileData>({ product, onAdd }: RowProps<P>) {
  const theme = useTheme()
  const left = useLeft(product.productId, product.sellable)
  const { flashStyle, onPress } = useAddPress(product, onAdd)
  const none = left <= 0
  const sub = [product.genericName && product.genericName !== product.name ? product.genericName : null, product.brandName]
    .filter(Boolean)
    .join(" · ")
  // Never `disabled` when none are left: only greyed. The tap still goes to
  // addToCart, which asks the server for more allowance (online build) or
  // says why it can't add — a disabled row would silently swallow the tap.
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={motion.rowPressScale}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}${product.strength ? ` ${product.strength}` : ""}, ${leftLabel(left)}`}
      accessibilityHint={none ? (OFFLINE_EDITION ? undefined : "Checks the server for more stock") : "Adds one to the cart"}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.border, backgroundColor: pressed ? theme.mutedStrong : theme.surface },
        none && styles.disabled,
      ]}
    >
      <Animated.View pointerEvents="none" style={[styles.flash, { backgroundColor: theme.green100 }, flashStyle]} />
      <View style={styles.rowBody}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {product.name}
          {product.strength ? <Text variant="body" tone="secondary">{`  ${product.strength}`}</Text> : null}
        </Text>
        {sub ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <Text variant="caption" tone={none ? "danger" : left <= 5 ? "warning" : "secondary"}>
            {leftLabel(left)}
          </Text>
          <ClinicalBadges requiresPrescription={product.requiresPrescription} isControlled={product.isControlled} />
        </View>
      </View>
      <View style={styles.priceCol}>
        <Money cents={toCents(product.sellingPrice)} variant="headline" />
        <Text variant="caption" tone="tertiary">
          per {product.baseUnit}
        </Text>
      </View>
    </PressableScale>
  )
}
export const ProductResultRow = memo(ProductResultRowImpl) as typeof ProductResultRowImpl

interface TileProps<P extends ProductTileData> extends RowProps<P> {
  width: number
}

/** Large "Quick add" tile (best sellers). */
function QuickAddTileImpl<P extends ProductTileData>({ product, onAdd, width }: TileProps<P>) {
  const theme = useTheme()
  const left = useLeft(product.productId, product.sellable)
  const { flashStyle, onPress } = useAddPress(product, onAdd)
  const none = left <= 0
  return (
    // Greyed, not disabled, when none are left (see ProductResultRow).
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Quick add ${product.name}${product.strength ? ` ${product.strength}` : ""}${none ? `, ${leftLabel(0)}` : ""}`}
      style={[styles.tile, { width, borderColor: theme.border, backgroundColor: theme.surface }, none && styles.disabled]}
    >
      <Animated.View pointerEvents="none" style={[styles.flash, { backgroundColor: theme.green100 }, flashStyle]} />
      <Text variant="label" numberOfLines={2}>
        {product.name}
        {product.strength ? ` ${product.strength}` : ""}
      </Text>
      <View style={styles.tileFoot}>
        <Money cents={toCents(product.sellingPrice)} variant="label" tone="success" />
        {none ? (
          <Text variant="caption" tone="danger">
            None left
          </Text>
        ) : null}
      </View>
    </PressableScale>
  )
}
export const QuickAddTile = memo(QuickAddTileImpl) as typeof QuickAddTileImpl

const styles = StyleSheet.create({
  badges: { flexDirection: "row", gap: space.xs },
  flash: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 72,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: { flex: 1, gap: space.xxs },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  priceCol: { alignItems: "flex-end" },
  disabled: { opacity: 0.45 },
  tile: {
    minHeight: TOUCH_TARGET + 32,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    justifyContent: "space-between",
    gap: space.xs,
    overflow: "hidden",
  },
  tileFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
})
