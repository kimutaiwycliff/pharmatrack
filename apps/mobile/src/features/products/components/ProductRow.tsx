import { formatKES } from "@pharmatrack/core"
import { StyleSheet, View } from "react-native"
import { ListRow, Money, StatusBadge, Text } from "../../../components"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { priceCents, productSubtitle } from "../logic/form"
import type { ProductListItem } from "../types"
import { ProductThumb } from "./ProductThumb"

interface ProductRowProps {
  product: ProductListItem
  onPress: () => void
  showCost: boolean
  selected?: boolean
}

export function ProductRow({ product, onPress, showCost, selected }: ProductRowProps) {
  const theme = useTheme()
  const price = priceCents(product.selling_price)
  const cost = showCost ? priceCents(product.cost_price) : null
  const subtitle = productSubtitle(product)
  const flags = [product.requires_prescription && "prescription only", product.is_controlled && "controlled", !product.is_active && "inactive"]
    .filter(Boolean)
    .join(", ")
  return (
    <ListRow
      title={product.name}
      subtitle={subtitle || null}
      leading={<ProductThumb url={product.image_url} />}
      onPress={onPress}
      style={selected ? { backgroundColor: theme.green50 } : undefined}
      accessibilityLabel={[product.name, subtitle, price != null ? formatKES(price) : "", flags, selected ? "selected" : ""]
        .filter(Boolean)
        .join(", ")}
      accessibilityHint="Opens the product"
      meta={
        product.requires_prescription || product.is_controlled || !product.is_active ? (
          <View style={styles.badges}>
            {!product.is_active ? <StatusBadge status="danger" label="Inactive" /> : null}
            {product.requires_prescription ? <StatusBadge status="neutral" label="Rx" /> : null}
            {product.is_controlled ? <StatusBadge status="warning" label="Controlled" /> : null}
          </View>
        ) : null
      }
      trailing={
        <View style={styles.prices}>
          {price != null ? <Money cents={price} /> : <Text tone="tertiary">—</Text>}
          <Text variant="caption" tone="tertiary">
            per {product.base_unit}
          </Text>
          {cost != null ? (
            <Text variant="caption" tone="secondary" tabular>
              Cost {formatKES(cost)}
            </Text>
          ) : null}
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.xxs },
  prices: { alignItems: "flex-end", gap: space.xxs },
})
