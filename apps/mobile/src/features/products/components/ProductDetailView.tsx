import Ionicons from "@expo/vector-icons/Ionicons"
import { router } from "expo-router"
import { useState, type ReactNode } from "react"
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native"
import { Button, Card, ErrorState, IconButton, Money, SkeletonBlock, SkeletonList, StatusBadge, Text } from "../../../components"
import { useIsOnline } from "../../../components/NeedsInternet"
import { useCan } from "../../../hooks/useCan"
import { useQuery } from "../../../hooks/useQuery"
import { errorMessage } from "../../../lib/api"
import { env } from "../../../lib/env"
import { toast } from "../../../lib/toast"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { getProduct, listCategories, listSuppliers, setProductActive } from "../data"
import { notifyProductsChanged, useRefreshOnProductsChange } from "../events"
import { categoryLabel, marginPercent, priceCents, productSubtitle } from "../logic/form"
import { plural } from "../logic/units"
import type { PackSize } from "../types"
import { DeleteProductSheet } from "./DeleteProductSheet"
import { LabelSheet } from "./LabelSheet"
import { PackSizesSection } from "./PackSizesSection"
import { ProductThumb } from "./ProductThumb"
import { SplitUnitSheet } from "./SplitUnitSheet"

interface ProductDetailViewProps {
  productId: string
  /** Called after the product is deleted (phone: go back; tablet: clear selection). */
  onDeleted: () => void
}

type Panel = null | "delete" | "split"

// Everything about one product: info, prices, pack sizes, label printing and
// the lifecycle actions web spreads over EditProductSheet / DeleteProductDialog.
// Used by /products/[id] on phones and as the right pane of /products on tablets.
export function ProductDetailView({ productId, onDeleted }: ProductDetailViewProps) {
  const theme = useTheme()
  const can = useCan()
  const online = useIsOnline()
  const q = useQuery(`product:${productId}`, () => getProduct(productId))
  useRefreshOnProductsChange(q.refresh)
  // Names for the category / supplier ids (cheap lists, cached per mount).
  const cats = useQuery("product-categories", () => listCategories())
  const sups = useQuery("product-suppliers", () => listSuppliers())

  const [panel, setPanel] = useState<Panel>(null)
  const [session, setSession] = useState(0)
  const [label, setLabel] = useState<{ code: string; productName: string; price: number } | null>(null)
  const [toggling, setToggling] = useState(false)

  if (q.loading) {
    return (
      <View style={styles.skeleton} accessibilityLabel="Loading product" accessibilityRole="progressbar">
        <SkeletonBlock height={72} width={72} />
        <SkeletonBlock height={22} width="70%" />
        <SkeletonBlock height={14} width="40%" />
        <SkeletonList rows={5} />
      </View>
    )
  }
  if (!q.data) return <ErrorState message={q.error ?? "Product not found"} onRetry={q.retry} />

  const { product, packSizes } = q.data
  const canEdit = can("products.edit")
  const showCost = can("cost.view") && product.cost_price !== undefined
  const priceC = priceCents(product.selling_price)
  const costC = showCost ? priceCents(product.cost_price) : null
  const margin = showCost ? marginPercent(product.cost_price != null ? String(product.cost_price) : "", String(product.selling_price)) : null
  const category = cats.data?.find((c) => c.id === product.category_id)
  const supplier = sups.data?.find((s) => s.id === product.supplier_id)
  const barcode = product.gtin ?? product.barcode_raw
  // Split-unit converts every branch's batches server-side: online only, never controlled.
  const canSplit = canEdit && !product.is_controlled && !env.EXPO_PUBLIC_OFFLINE_MODE && online

  function openPanel(p: Panel) {
    setSession((n) => n + 1)
    setPanel(p)
  }

  function changed() {
    q.refresh()
    notifyProductsChanged()
  }

  async function toggleActive() {
    setToggling(true)
    try {
      await setProductActive(product, !product.is_active)
      toast.success(product.is_active ? `${product.name} deactivated — hidden from POS and inventory` : `${product.name} reactivated`)
      q.setData((d) => (d ? { ...d, product: { ...d.product, is_active: !product.is_active } } : d))
      notifyProductsChanged()
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update the product. Please try again."))
    } finally {
      setToggling(false)
    }
  }

  function setPackSizes(next: PackSize[]) {
    q.setData((d) => (d ? { ...d, packSizes: next } : d))
    notifyProductsChanged()
  }

  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={theme.green} colors={[theme.green]} />}
      >
        {q.error ? <ErrorState compact message={q.error} onRetry={q.retry} /> : null}

        <View style={styles.hero}>
          <ProductThumb url={product.image_url} size={72} />
          <View style={styles.heroText}>
            <Text variant="title" accessibilityRole="header">
              {product.name}
            </Text>
            {productSubtitle(product) ? <Text tone="secondary">{productSubtitle(product)}</Text> : null}
            <View style={styles.badges}>
              <StatusBadge status={product.is_active ? "ok" : "danger"} label={product.is_active ? "Active" : "Inactive"} />
              {product.requires_prescription ? <StatusBadge status="neutral" label="Prescription only" /> : null}
              {product.is_controlled ? <StatusBadge status="warning" label="Controlled" /> : null}
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          {canEdit ? (
            <Button
              title="Edit"
              onPress={() => router.push({ pathname: "/products/[id]/edit", params: { id: product.id } })}
              leadingIcon={<Ionicons name="create-outline" size={18} color={theme.onAccent} />}
              style={styles.flex}
            />
          ) : null}
          {can("stock.receive") ? (
            <Button
              title="Receive stock"
              variant="secondary"
              onPress={() => router.push({ pathname: "/receive-stock", params: { productId: product.id } })}
              leadingIcon={<Ionicons name="download-outline" size={18} color={theme.text} />}
              style={styles.flex}
            />
          ) : null}
        </View>
        <Button
          title="Batches & stock"
          variant="secondary"
          onPress={() => router.push({ pathname: "/product-batches", params: { productId: product.id, productName: product.name } })}
          leadingIcon={<Ionicons name="layers-outline" size={18} color={theme.text} />}
          accessibilityHint="Stock on hand by batch and expiry"
        />

        <Card style={styles.card}>
          <Text variant="headline" accessibilityRole="header">
            Price
          </Text>
          <Row label={`Selling price per ${product.base_unit}`}>{priceC != null ? <Money cents={priceC} /> : <Text>—</Text>}</Row>
          {showCost ? (
            <Row label={`Cost per ${product.base_unit}`}>
              {costC != null ? <Money cents={costC} variant="body" /> : <Text tone="tertiary">Not set</Text>}
            </Row>
          ) : null}
          {margin != null ? (
            <Row label="Margin">
              <Text variant="bodyStrong" tone={margin >= 20 ? "success" : margin >= 0 ? "warning" : "danger"}>
                {margin.toFixed(1)}%
              </Text>
            </Row>
          ) : null}
          <Row label="Max discount">
            <Text>{product.max_discount_percent != null ? `${product.max_discount_percent}%` : "No limit"}</Text>
          </Row>
          <Row label="Low-stock alert at">
            <Text>
              {product.reorder_level.toLocaleString("en-KE")} {plural(product.base_unit)}
            </Text>
          </Row>
          {canSplit ? (
            <Button title="Sell in smaller units…" variant="ghost" size="sm" onPress={() => openPanel("split")} accessibilityHint="Split each unit into smaller ones, e.g. a strip into capsules" />
          ) : null}
        </Card>

        <Card style={styles.card}>
          <Text variant="headline" accessibilityRole="header">
            Details
          </Text>
          {product.generic_name && product.generic_name !== product.name ? <Row label="Generic name" value={product.generic_name} /> : null}
          {product.brand_name ? <Row label="Brand" value={product.brand_name} /> : null}
          {product.manufacturer ? <Row label="Manufacturer" value={product.manufacturer} /> : null}
          <Row label="Category" value={category ? categoryLabel(category, cats.data ?? []) : product.category_id ? "…" : "None"} />
          <Row label="Default supplier" value={supplier ? supplier.name : product.supplier_id ? "…" : "None"} />
          <Row label="Sold per" value={product.base_unit} />
          {product.pack_label || product.units_per_pack > 1 ? (
            <Row label="Pack" value={`${product.pack_label ?? "Pack"} of ${product.units_per_pack} ${plural(product.base_unit)}`} />
          ) : null}
          <Row label="Barcode">
            <View style={styles.barcode}>
              <Text tabular selectable>
                {barcode ?? "None"}
              </Text>
              {barcode ? (
                <IconButton
                  icon="pricetag-outline"
                  accessibilityLabel="Print barcode label"
                  onPress={() => setLabel({ code: barcode, productName: product.name, price: product.selling_price })}
                />
              ) : null}
            </View>
          </Row>
        </Card>

        <PackSizesSection
          productId={product.id}
          productName={product.name}
          baseUnit={product.base_unit}
          packSizes={packSizes}
          canEdit={canEdit}
          onChange={setPackSizes}
          onPrint={setLabel}
        />

        {canEdit || can("products.delete") ? (
          <Card style={styles.card}>
            <Text variant="headline" accessibilityRole="header">
              Retire this product
            </Text>
            {canEdit ? (
              <>
                <Text variant="caption" tone="secondary">
                  {product.is_active
                    ? "Deactivating hides it from POS and inventory. All history is kept and you can reactivate it any time."
                    : "It's hidden from POS and inventory. Reactivate to sell it again."}
                </Text>
                <Button
                  title={product.is_active ? "Deactivate" : "Reactivate"}
                  variant="secondary"
                  onPress={toggleActive}
                  loading={toggling}
                  leadingIcon={<Ionicons name={product.is_active ? "eye-off-outline" : "eye-outline"} size={18} color={theme.text} />}
                />
              </>
            ) : null}
            {can("products.delete") ? (
              <Button
                title="Delete…"
                variant="ghost"
                onPress={() => openPanel("delete")}
                leadingIcon={<Ionicons name="trash-outline" size={18} color={theme.red} />}
                accessibilityHint="Shows what's attached to this product before anything is removed"
              />
            ) : null}
          </Card>
        ) : null}
      </ScrollView>

      <DeleteProductSheet
        key={`delete:${session}`}
        open={panel === "delete"}
        product={product}
        onClose={() => setPanel(null)}
        onDone={(r) => {
          notifyProductsChanged()
          if (r === "deleted") onDeleted()
          else q.setData((d) => (d ? { ...d, product: { ...d.product, is_active: false } } : d))
        }}
      />
      {canSplit ? <SplitUnitSheet key={`split:${session}`} open={panel === "split"} product={product} onClose={() => setPanel(null)} onDone={changed} /> : null}
      <LabelSheet label={label} onClose={() => setLabel(null)} />
    </>
  )
}

function Row({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
  return (
    <View style={styles.row} accessible={!children} accessibilityLabel={value ? `${label}: ${value}` : undefined}>
      <Text tone="secondary" style={styles.rowLabel}>
        {label}
      </Text>
      <View style={styles.rowValue}>{children ?? <Text align="right">{value}</Text>}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  skeleton: { gap: space.md, paddingTop: space.md },
  content: { gap: space.md, paddingBottom: space.xxl },
  hero: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  heroText: { flex: 1, gap: space.xs },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  actions: { flexDirection: "row", gap: space.md },
  flex: { flex: 1 },
  card: { gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, minHeight: 32 },
  rowLabel: { flexShrink: 1 },
  rowValue: { flexShrink: 1, alignItems: "flex-end" },
  barcode: { flexDirection: "row", alignItems: "center", gap: space.xs },
})
