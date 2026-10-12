import Ionicons from "@expo/vector-icons/Ionicons"
import { FlashList } from "@shopify/flash-list"
import { router } from "expo-router"
import { useEffect, useState } from "react"
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from "react-native"
import { Chip, EmptyState, ErrorState, IconButton, SkeletonList, Text, TextField } from "../../../components"
import { useCan } from "../../../hooks/useCan"
import { usePagedQuery } from "../../../hooks/useQuery"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { listProducts } from "../data"
import { useRefreshOnProductsChange } from "../events"
import { filterProducts, PRODUCT_FILTERS, searchTerm, type ProductFilter } from "../logic/list"
import type { ProductListItem } from "../types"
import { ProductRow } from "./ProductRow"

interface ProductListProps {
  onSelect: (product: ProductListItem) => void
  /** Highlighted row (tablet master–detail). */
  selectedId?: string | null
}

// The /products list: server search (from 2 characters, like the web API),
// flag chips over the loaded rows, infinite paging, pull-to-refresh.
export function ProductList({ onSelect, selectedId }: ProductListProps) {
  const theme = useTheme()
  const can = useCan()
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState<string | undefined>(undefined)
  const [filter, setFilter] = useState<ProductFilter>("all")

  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchTerm(query)), 300)
    return () => clearTimeout(t)
  }, [query])

  const list = usePagedQuery<ProductListItem>(`products:${debounced ?? ""}`, (page) => listProducts(page, debounced))
  useRefreshOnProductsChange(list.refresh)

  const rows = filterProducts(list.items, filter)
  const showCost = can("cost.view")
  const canCreate = can("products.create")

  function renderEmpty() {
    if (debounced) {
      return (
        <EmptyState
          icon={<Ionicons name="search-outline" size={32} color={theme.textTertiary} />}
          title="No matches"
          message={`No products match “${debounced}”. Search by name, brand, strength or barcode.`}
          action={{ label: "Clear search", onPress: () => setQuery("") }}
        />
      )
    }
    if (filter !== "all" && list.items.length > 0) {
      const label = PRODUCT_FILTERS.find((f) => f.key === filter)?.label.toLowerCase()
      return (
        <EmptyState
          icon={<Ionicons name="funnel-outline" size={32} color={theme.textTertiary} />}
          message={
            list.hasMore
              ? `No ${label} products in the first ${list.items.length} loaded.`
              : `No ${label} products.`
          }
          action={list.hasMore ? { label: "Look further", onPress: list.loadMore } : { label: "Show all", onPress: () => setFilter("all") }}
        />
      )
    }
    return (
      <EmptyState
        icon={<Ionicons name="medkit-outline" size={32} color={theme.textTertiary} />}
        title="No products yet"
        message="Add the medicines you stock, or load the drug catalog from More."
        action={canCreate ? { label: "Add product", onPress: () => router.push("/products/new") } : undefined}
      />
    )
  }

  return (
    <View style={styles.flex}>
      <View style={styles.controls}>
        <TextField
          label="Search products"
          hideLabel
          placeholder="Search name, brand, strength or barcode"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          leading={<Ionicons name="search" size={18} color={theme.textTertiary} />}
          trailing={query ? <IconButton icon="close-circle" size={18} color={theme.textTertiary} accessibilityLabel="Clear search" onPress={() => setQuery("")} /> : null}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          {PRODUCT_FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} accessibilityLabel={`Show ${f.label.toLowerCase()} products`} />
          ))}
        </ScrollView>
        {!list.loading && list.items.length > 0 ? (
          <Text variant="caption" tone="secondary">
            {list.total.toLocaleString("en-KE")} product{list.total === 1 ? "" : "s"}
            {filter !== "all" ? ` · showing ${PRODUCT_FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} of those loaded` : ""}
          </Text>
        ) : null}
        {list.error && list.items.length > 0 ? <ErrorState compact message={list.error} onRetry={list.retry} /> : null}
      </View>

      {list.loading ? (
        <SkeletonList rows={8} />
      ) : list.error && list.items.length === 0 ? (
        <ErrorState message={list.error} onRetry={list.retry} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(item) => item.id}
          extraData={selectedId}
          renderItem={({ item }) => (
            <ProductRow product={item} showCost={showCost} selected={item.id === selectedId} onPress={() => onSelect(item)} />
          )}
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={theme.green} colors={[theme.green]} />}
          ListEmptyComponent={renderEmpty()}
          ListFooterComponent={list.loadingMore ? <ActivityIndicator style={styles.footer} color={theme.green} accessibilityLabel="Loading more products" /> : null}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  controls: { gap: space.sm, marginBottom: space.sm },
  chips: { gap: space.sm },
  footer: { paddingVertical: space.lg },
})
