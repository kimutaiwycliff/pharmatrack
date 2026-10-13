import Ionicons from "@expo/vector-icons/Ionicons"
import { FlashList } from "@shopify/flash-list"
import { forwardRef, memo, useCallback, useImperativeHandle, useMemo, useState, type ReactNode, type Ref } from "react"
import { ScrollView, StyleSheet, View, type TextInput } from "react-native"
import { Chip, EmptyState, Text } from "../../../components"
import { useCartStore } from "../../../store/cart"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { addScanned, addToCart, useRecentScans } from "../actions"
import { getProduct } from "../data"
import { usePosSearch, type PosProduct } from "../usePosSearch"
import { CART_BAR_SPACE } from "./CartSummary"
import { ProductResultRow, QuickAddTile } from "./ProductParts"
import { SearchBar } from "./SearchBar"

export interface ProductBrowserHandle {
  /** Empty the search (after a sale). */
  clear: () => void
}

interface ProductBrowserProps {
  inputRef: Ref<TextInput>
  /** Re-runs search + quick add (after a sale, a sync or a top-up). */
  refreshKey: string
  tablet: boolean
  onFocusChange: (focused: boolean) => void
  /** Phone: the floating cart bar, overlaid on the list. */
  children?: ReactNode
}

// The till's left side: search field, "Recently scanned" + "Quick add", and
// the product list. The search text lives HERE, not in the POS screen, so a
// keystroke re-renders only this — never the header, cart or payment sheets.
const ProductBrowserImpl = forwardRef<ProductBrowserHandle, ProductBrowserProps>(function ProductBrowser(
  { inputRef, refreshKey, tablet, onFocusChange, children },
  ref,
) {
  const theme = useTheme()
  const [query, setQuery] = useState("")
  const [gridWidth, setGridWidth] = useState(0)
  const recent = useRecentScans((s) => s.recent)
  const hasItems = useCartStore((s) => s.items.length > 0)
  const { results, quickAdd, error, retry } = usePosSearch(query, refreshKey)

  useImperativeHandle(ref, () => ({ clear: () => setQuery("") }), [])

  // Stable for memoised rows/tiles; resolves true when it went in (green flash).
  const add = useCallback((p: PosProduct) => addToCart(p), [])
  const renderRow = useCallback(({ item }: { item: PosProduct }) => <ProductResultRow product={item} onAdd={add} />, [add])

  function onSubmitSearch() {
    // Enter on a single match adds it (keyboard-only cashiers).
    if (results.length === 1 && results[0]) void add(results[0])
  }

  const columns = tablet ? 4 : 2
  const tileWidth = gridWidth > 0 ? Math.floor((gridWidth - space.sm * (columns - 1)) / columns) : 0
  const browsing = query.trim() === ""

  // Memoised so typing (which changes `query`, then `results`) doesn't rebuild the tiles.
  const quickSection = useMemo(
    () =>
      browsing ? (
        <View style={styles.quickSection} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          {recent.length > 0 ? (
            <>
              <Text variant="label" tone="secondary">
                Recently scanned
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow} keyboardShouldPersistTaps="handled">
                {recent.map((r) => (
                  <Chip key={r.productId} label={r.name} accessibilityLabel={`Add ${r.name} again`} onPress={() => addRecent(r.productId)} />
                ))}
              </ScrollView>
            </>
          ) : null}
          {quickAdd.length > 0 && tileWidth > 0 ? (
            <>
              <Text variant="label" tone="secondary">
                Quick add
              </Text>
              <View style={styles.grid}>
                {quickAdd.map((p) => (
                  <QuickAddTile key={p.productId} product={p} width={tileWidth} onAdd={add} />
                ))}
              </View>
            </>
          ) : null}
          <Text variant="label" tone="secondary">
            All products
          </Text>
        </View>
      ) : null,
    [browsing, recent, quickAdd, tileWidth, add],
  )

  const empty = error ? (
    <EmptyState
      icon={<Ionicons name="alert-circle-outline" size={32} color={theme.red} />}
      message={error}
      action={{ label: "Retry", onPress: retry, icon: <Ionicons name="refresh-outline" size={18} color={theme.text} /> }}
    />
  ) : (
    <EmptyState
      icon={<Ionicons name="search-outline" size={32} color={theme.textTertiary} />}
      message={query.trim() ? `No products match "${query.trim()}"` : "No products on this phone yet — sync first"}
    />
  )

  return (
    <>
      <SearchBar
        ref={inputRef}
        value={query}
        onChangeText={setQuery}
        onScan={onScan}
        onSubmitSearch={onSubmitSearch}
        onFocusChange={onFocusChange}
      />
      <View style={styles.flex}>
        <FlashList
          data={results}
          keyExtractor={productKey}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={quickSection}
          renderItem={renderRow}
          ListEmptyComponent={empty}
          // Phone: the cart bar floats over the list's bottom — leave room for it.
          contentContainerStyle={!tablet && hasItems ? styles.listContentWithBar : styles.listContent}
        />
        {children}
      </View>
    </>
  )
})

/** Memoised: re-renders for its own state (search, cart count), not every till render. */
export const ProductBrowser = memo(ProductBrowserImpl)

const productKey = (p: PosProduct) => p.productId

function onScan(code: string) {
  void addScanned(code)
}

/** "Recently scanned" chip: re-read the product (stock may have moved) and add it. */
async function addRecent(productId: string): Promise<void> {
  const p = await getProduct(productId)
  if (p) await addToCart(p)
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  quickSection: { gap: space.sm, paddingBottom: space.sm },
  recentRow: { gap: space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  listContent: { paddingBottom: space.lg },
  listContentWithBar: { paddingBottom: CART_BAR_SPACE + space.sm },
})
