import { toCents } from "@pharmatrack/core"
import { memo } from "react"
import { Pressable, StyleSheet, View } from "react-native"
import { Chip, Money, Text } from "../../../components"
import { env } from "../../../lib/env"
import { useTheme } from "../../../theme/useTheme"
import { radius, space, TOUCH_TARGET } from "../../../theme/tokens"

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
}

interface RowProps {
  product: ProductTileData
  /** Base units still sellable once the cart is counted. */
  left: number
  onPress: () => void
}

// One search result: big tap target with everything a cashier checks before
// adding — name + strength, price per base unit, how many are left, Rx flags.
export const ProductResultRow = memo(function ProductResultRow({ product, left, onPress }: RowProps) {
  const theme = useTheme()
  const none = left <= 0
  const sub = [product.genericName && product.genericName !== product.name ? product.genericName : null, product.brandName]
    .filter(Boolean)
    .join(" · ")
  return (
    <Pressable
      onPress={onPress}
      disabled={none}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}${product.strength ? ` ${product.strength}` : ""}, ${leftLabel(left)}`}
      accessibilityHint={none ? undefined : "Adds one to the cart"}
      accessibilityState={{ disabled: none }}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.border, backgroundColor: pressed ? theme.mutedStrong : theme.surface },
        none && styles.disabled,
      ]}
    >
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
    </Pressable>
  )
})

interface TileProps extends RowProps {
  width: number
}

/** Large "Quick add" tile (best sellers). */
export function QuickAddTile({ product, left, onPress, width }: TileProps) {
  const theme = useTheme()
  const none = left <= 0
  return (
    <Pressable
      onPress={onPress}
      disabled={none}
      accessibilityRole="button"
      accessibilityLabel={`Quick add ${product.name}${product.strength ? ` ${product.strength}` : ""}`}
      accessibilityState={{ disabled: none }}
      style={({ pressed }) => [
        styles.tile,
        { width, borderColor: theme.border, backgroundColor: pressed ? theme.green50 : theme.surface },
        none && styles.disabled,
      ]}
    >
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
    </Pressable>
  )
}

const styles = StyleSheet.create({
  badges: { flexDirection: "row", gap: space.xs },
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
  },
  tileFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
})
