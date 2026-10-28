import { useState } from "react"
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import Ionicons from "@expo/vector-icons/Ionicons"
import {
  BranchSwitcher,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  MasterDetail,
  NeedsInternet,
  Screen,
  ScreenHeader,
  SkeletonList,
  TextField,
  useIsOnline,
} from "../../src/components"
import { useCan } from "../../src/hooks/useCan"
import { useIsTablet } from "../../src/hooks/useIsTablet"
import { usePagedQuery } from "../../src/hooks/useQuery"
import { env } from "../../src/lib/env"
import { useBranchScope } from "../../src/store/branchScope"
import { useTheme } from "../../src/theme/useTheme"
import { space } from "../../src/theme/tokens"
import { BatchesView } from "../../src/features/inventory/components/BatchesView"
import { InventoryRow } from "../../src/features/inventory/components/InventoryRow"
import { ListFooterSpinner } from "../../src/features/inventory/components/ListFooterSpinner"
import { fetchInventoryPage, useInventoryVersion } from "../../src/features/inventory/data"
import { STATUS_FILTERS, parseStatusParam, type StatusFilter } from "../../src/features/inventory/logic/status"
import type { InventoryProduct, InventorySummary } from "../../src/features/inventory/logic/types"
import { useDebouncedValue } from "../../src/features/inventory/useDebouncedValue"

// Inventory tab — mirrors apps/web's inventory page over GET /api/inventory
// (status filter, q ≥ 2 chars, page/limit, summary counts; branch_id omitted
// = "All branches" for people with branches.all). The Offline Edition reads
// the same shape from repo/inventory.ts's listLocalInventory. Dashboard links
// here as /inventory?status=low_stock|out_of_stock|expiring|controlled.
// Phones open a product's batches as /product-batches; tablets show them in
// the right-hand pane.

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE

function countFor(summary: InventorySummary | null, key: StatusFilter): number | null {
  if (!summary) return null
  switch (key) {
    case "low_stock":
      return summary.lowStock
    case "out_of_stock":
      return summary.outOfStock
    case "expiring":
      return summary.expiring
    case "controlled":
      return summary.controlled
    default:
      return null
  }
}

export default function Inventory() {
  const theme = useTheme()
  const can = useCan()
  const tablet = useIsTablet()
  const online = useIsOnline()
  const scope = useBranchScope()
  const version = useInventoryVersion((s) => s.list)
  const params = useLocalSearchParams<{ status?: string }>()

  // The tab stays mounted, so a later Dashboard link with a new ?status= must
  // still win: adopt the param whenever it changes (derived-state pattern).
  const [filter, setFilter] = useState<StatusFilter>(() => parseStatusParam(params.status))
  const [seenParam, setSeenParam] = useState(params.status)
  if (params.status !== seenParam) {
    setSeenParam(params.status)
    setFilter(parseStatusParam(params.status))
  }

  const [query, setQuery] = useState("")
  const q = useDebouncedValue(query.trim(), 300)
  const [summary, setSummary] = useState<InventorySummary | null>(null)
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)

  const branchId = OFFLINE ? undefined : scope.branchId
  const key = OFFLINE || online ? `inventory:${OFFLINE ? "local" : (branchId ?? "all")}:${filter}:${q.length >= 2 ? q : ""}:${version}` : null
  const list = usePagedQuery<InventoryProduct>(key, async (page) => {
    const res = await fetchInventoryPage({ page, status: filter, q, branchId })
    setSummary(res.summary)
    return { items: res.products, total: res.total }
  })

  const canReceive = can("stock.receive")
  const filtered = filter !== "all" || q.length >= 2

  function openProduct(p: InventoryProduct) {
    if (tablet) setSelected({ id: p.product_id, name: p.name })
    else router.push({ pathname: "/product-batches", params: { productId: p.product_id, productName: p.name } })
  }

  const header = (
    <ScreenHeader
      title="Inventory"
      hideBack
      subtitle={list.loading ? null : `${list.total.toLocaleString("en-KE")} product${list.total === 1 ? "" : "s"}${OFFLINE ? "" : ` · ${scope.label}`}`}
      right={
        <>
          {OFFLINE ? null : <BranchSwitcher />}
          {!OFFLINE && can("stock.count") ? (
            <IconButton icon="clipboard-outline" accessibilityLabel="Stock take" onPress={() => router.push("/stock-take")} />
          ) : null}
          {canReceive ? (
            <IconButton icon="add-circle-outline" variant="tonal" accessibilityLabel="Receive stock" onPress={() => router.push("/receive-stock")} />
          ) : null}
        </>
      }
    />
  )

  if (!OFFLINE && !online) {
    return (
      <Screen>
        {header}
        <NeedsInternet feature="Inventory" />
      </Screen>
    )
  }

  const controls = (
    <View style={styles.controls}>
      <TextField
        label="Search inventory"
        hideLabel
        placeholder="Search name, brand, strength or barcode"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        leading={<Ionicons name="search-outline" size={20} color={theme.textTertiary} />}
        trailing={
          query ? <IconButton icon="close-circle" accessibilityLabel="Clear search" color={theme.textTertiary} onPress={() => setQuery("")} /> : null
        }
      />
      <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {STATUS_FILTERS.map((f) => {
          const n = countFor(summary, f.key)
          return (
            <Chip
              key={f.key}
              label={n != null ? `${f.label} · ${n}` : f.label}
              selected={filter === f.key}
              tone={f.key === "out_of_stock" && n ? "danger" : (f.key === "low_stock" || f.key === "expiring") && n ? "warning" : "default"}
              onPress={() => setFilter(f.key)}
              accessibilityLabel={n != null ? `${f.label}, ${n} products` : f.label}
            />
          )
        })}
      </ScrollView>
    </View>
  )

  const body = list.loading ? (
    <SkeletonList rows={8} />
  ) : list.error && list.items.length === 0 ? (
    <ErrorState message={list.error} onRetry={list.retry} />
  ) : (
    <FlashList
      data={list.items}
      keyExtractor={(p) => p.product_id}
      extraData={selected?.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      renderItem={({ item }) => <InventoryRow product={item} selected={tablet && selected?.id === item.product_id} onPress={() => openProduct(item)} />}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={theme.green} colors={[theme.green]} />}
      ListHeaderComponent={list.error ? <ErrorState compact message={list.error} onRetry={list.retry} /> : null}
      ListFooterComponent={<ListFooterSpinner visible={list.loadingMore} />}
      ListEmptyComponent={
        filtered ? (
          <EmptyState
            icon={<Ionicons name="search-outline" size={32} color={theme.textTertiary} />}
            title="Nothing matches"
            message={q.length >= 2 ? `No products match "${q}"${filter !== "all" ? " with this filter" : ""}.` : "No products in this group right now."}
            action={{
              label: "Clear search and filters",
              onPress: () => {
                setQuery("")
                setFilter("all")
              },
            }}
          />
        ) : (
          <EmptyState
            icon={<Ionicons name="cube-outline" size={32} color={theme.textTertiary} />}
            title="No products yet"
            message="Add your products, then receive stock to see it here."
            action={can("products.create") ? { label: "Add a product", onPress: () => router.push("/products/new") } : undefined}
          />
        )
      }
      contentContainerStyle={styles.listContent}
    />
  )

  const master = (
    <View style={styles.flex}>
      {controls}
      <View style={styles.flex}>{body}</View>
    </View>
  )

  return (
    <Screen>
      {header}
      {tablet ? (
        <MasterDetail
          master={master}
          detail={selected ? <BatchesView key={selected.id} productId={selected.id} productName={selected.name} variant="pane" /> : null}
          placeholder={{
            icon: <Ionicons name="layers-outline" size={36} color={theme.textTertiary} />,
            message: "Choose a product to see its batches",
          }}
        />
      ) : (
        master
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  controls: { gap: space.sm, marginBottom: space.sm },
  chips: { gap: space.sm, paddingVertical: space.xxs },
  listContent: { paddingBottom: space.xxl },
})
