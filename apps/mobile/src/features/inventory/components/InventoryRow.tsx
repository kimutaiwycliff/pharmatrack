import { StyleSheet, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { ListRow, Money, StatusBadge, Text } from "../../../components"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { badgeFor, visibleBadges } from "../logic/status"
import type { InventoryProduct } from "../logic/types"

interface InventoryRowProps {
  product: InventoryProduct
  onPress: () => void
  /** Tablet: the row whose batches are open on the right. */
  selected?: boolean
}

// One product in the Inventory list: name, brand · strength, stock on hand
// with status badges, selling price (and cost only when the API sent it —
// it's omitted for roles without cost.view).
export function InventoryRow({ product, onPress, selected }: InventoryRowProps) {
  const theme = useTheme()
  const sub = [product.brand_name, product.strength].filter((v): v is string => !!v).join(" · ")
  const badges = visibleBadges(product.status_badges)
  const stock = product.stock_on_hand ?? 0
  const unit = product.base_unit?.trim() || "units"
  const hasCost = typeof product.cost_price === "number"
  const price = typeof product.selling_price === "number" ? product.selling_price : null

  return (
    <ListRow
      title={product.name}
      subtitle={sub || null}
      onPress={onPress}
      accessibilityLabel={`${product.name}${sub ? `, ${sub}` : ""}. ${stock} ${unit} in stock${badges.length ? `. ${badges.map((b) => badgeFor(b).label).join(", ")}` : ""}`}
      accessibilityHint="Shows the batches for this product"
      style={selected ? { backgroundColor: theme.green50 } : undefined}
      meta={
        <View style={styles.meta}>
          <Text variant="caption" tone={stock <= 0 ? "danger" : "secondary"} tabular>
            {stock.toLocaleString("en-KE")} {unit} in stock
          </Text>
          {badges.map((code) => {
            const b = badgeFor(code)
            return <StatusBadge key={code} status={b.status} label={b.label} />
          })}
        </View>
      }
      trailing={
        <View style={styles.trailing}>
          {price != null ? <Money cents={Math.round(price * 100)} variant="label" /> : <Text variant="label">—</Text>}
          {hasCost ? (
            <Text variant="caption" tone="tertiary" tabular>
              Cost <Money cents={Math.round(product.cost_price! * 100)} variant="caption" tone="tertiary" />
            </Text>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs, marginTop: space.xxs },
  trailing: { alignItems: "flex-end", gap: space.xxs },
})
