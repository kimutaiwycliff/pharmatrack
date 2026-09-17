import { useEffect, useState } from "react"
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { apiFetch } from "../../src/lib/api-fetch"
import { env } from "../../src/lib/env"
import { listLocalInventory } from "../../src/repo/inventory"
import { useSessionStore } from "../../src/store/session"
import { useTheme } from "../../src/theme/useTheme"
import type { Theme } from "../../src/theme/tokens"
import { Button, Card, EmptyState, Screen, StatusBadge } from "../../src/components"
import type { BadgeStatus } from "../../src/components"

// Mirrors apps/web/app/api/inventory/route.ts's response shape exactly
// (verified against that file plus packages/db/src/schema/views.ts's
// product_stock view directly, not from memory). Money fields are decimal
// KES (not cents) — same convention as dashboard.tsx, so formatKES(Math.round(v * 100))
// is used throughout. `cost_price` is entirely OMITTED from a row (not
// nulled) for roles that can't view cost — apps/web/lib/auth/costVisibility.ts's
// omitCost() strips the key server-side — so it's optional here and only
// rendered when it's actually present as a number.
interface InventoryProduct {
  product_id: string
  name: string
  brand_name: string | null
  strength: string | null
  gtin: string | null
  selling_price: number | null
  cost_price?: number | null
  stock_on_hand: number | null
  reorder_level: number | null
  earliest_expiry: string | null
  expiry_days: number | null
  is_controlled: boolean | null
  // Populated by getStatus() in the route: any of
  // "out_of_stock" | "low_stock" | "ok" | "expiring" | "controlled".
  status_badges: string[]
}

interface InventorySummary {
  outOfStock: number
  lowStock: number
  expiring: number
  controlled: number
}

interface InventoryResponse {
  products: InventoryProduct[]
  total: number
  page: number
  limit: number
  summary: InventorySummary
}

// Matches the route's `status` query param exactly — "ok" is a badge value
// but not a filterable status, so it's excluded from this list.
type StatusFilter = "all" | "out_of_stock" | "low_stock" | "expiring" | "controlled"

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "out_of_stock", label: "Out of stock" },
  { key: "low_stock", label: "Low stock" },
  { key: "expiring", label: "Expiring" },
  { key: "controlled", label: "Controlled" },
]

const PAGE_SIZE = 20

function badgeFor(code: string): { status: BadgeStatus; label: string } {
  switch (code) {
    case "out_of_stock":
      return { status: "danger", label: "Out of stock" }
    case "low_stock":
      return { status: "warning", label: "Low stock" }
    case "expiring":
      return { status: "warning", label: "Expiring" }
    case "controlled":
      return { status: "neutral", label: "Controlled" }
    default:
      return { status: "ok", label: "OK" }
  }
}

export default function Inventory() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { branchId } = useSessionStore()

  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [page, setPage] = useState(1)
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<InventorySummary | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Bumped by retry/pull-to-refresh to re-run the effect below without
  // exposing the fetch function itself as a captured effect dependency
  // (mirrors dashboard.tsx's shape, required by this repo's
  // react-hooks/set-state-in-effect rule).
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!branchId) return
    const currentBranchId = branchId
    async function load() {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        try {
          const trimmed = query.trim()
          const json = await listLocalInventory({ status: statusFilter, page, limit: PAGE_SIZE, q: trimmed.length >= 2 ? trimmed : undefined })
          setProducts((prev) => (page === 1 ? json.products : [...prev, ...json.products]))
          setSummary(json.summary)
          setTotal(json.total)
          setLoaded(true)
          setError(null)
        } finally {
          setRefreshing(false)
          setLoadingMore(false)
        }
        return
      }
      try {
        const params = new URLSearchParams({
          branch_id: currentBranchId,
          status: statusFilter,
          page: String(page),
          limit: String(PAGE_SIZE),
        })
        const trimmed = query.trim()
        if (trimmed.length >= 2) params.set("q", trimmed)
        const res = await apiFetch(`/api/inventory?${params.toString()}`)
        if (!res.ok) {
          setError(`Could not load inventory (HTTP ${res.status})`)
          return
        }
        const json = (await res.json()) as InventoryResponse
        setProducts((prev) => (page === 1 ? json.products : [...prev, ...json.products]))
        setSummary(json.summary)
        setTotal(json.total)
        setLoaded(true)
        setError(null)
      } catch {
        setError("Could not reach the server. Check your connection and try again.")
      } finally {
        setRefreshing(false)
        setLoadingMore(false)
      }
    }
    load()
  }, [branchId, statusFilter, query, page, reloadToken])

  function retry() {
    setReloadToken((t) => t + 1)
  }

  function onRefresh() {
    setRefreshing(true)
    setPage(1)
    setReloadToken((t) => t + 1)
  }

  function onChangeQuery(text: string) {
    setQuery(text)
    setPage(1)
  }

  function onSelectFilter(key: StatusFilter) {
    setStatusFilter(key)
    setPage(1)
  }

  function loadMore() {
    setLoadingMore(true)
    setPage((p) => p + 1)
  }

  if (error && !loaded) {
    return (
      <Screen style={styles.centered}>
        <Card style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
          <Button
            title="Retry"
            variant="secondary"
            onPress={retry}
            icon={<Ionicons name="refresh-outline" size={18} color={theme.text} />}
          />
        </Card>
      </Screen>
    )
  }

  if (!loaded) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.label}>Loading…</Text>
      </Screen>
    )
  }

  const hasSummaryAlerts =
    !!summary && (summary.outOfStock > 0 || summary.lowStock > 0 || summary.expiring > 0 || summary.controlled > 0)
  const hasMore = products.length < total

  return (
    <Screen>
      <FlatList
        data={products}
        keyExtractor={(item) => item.product_id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.green} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Inventory</Text>

            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, brand, or barcode"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="none"
              value={query}
              onChangeText={onChangeQuery}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {FILTERS.map((f) => (
                <Pressable
                  key={f.key}
                  onPress={() => onSelectFilter(f.key)}
                  style={[styles.chip, statusFilter === f.key && styles.chipActive]}
                >
                  <Text style={[styles.chipText, statusFilter === f.key && styles.chipTextActive]}>{f.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {hasSummaryAlerts ? (
              <View style={styles.summaryRow}>
                {summary!.outOfStock > 0 ? (
                  <StatusBadge status="danger" label={`${summary!.outOfStock} out of stock`} />
                ) : null}
                {summary!.lowStock > 0 ? (
                  <StatusBadge status="warning" label={`${summary!.lowStock} low stock`} />
                ) : null}
                {summary!.expiring > 0 ? (
                  <StatusBadge status="warning" label={`${summary!.expiring} expiring soon`} />
                ) : null}
                {summary!.controlled > 0 ? (
                  <StatusBadge status="neutral" label={`${summary!.controlled} controlled`} />
                ) : null}
              </View>
            ) : null}

            {error ? <Text style={styles.inlineError}>{error}</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: "/product-batches", params: { productId: item.product_id, productName: item.name } })}>
            <ProductRow product={item} theme={theme} styles={styles} />
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="search-outline" size={28} color={theme.textTertiary} />}
            message="No products match your filters"
          />
        }
        ListFooterComponent={
          hasMore ? (
            <Button
              title="Load more"
              variant="secondary"
              onPress={loadMore}
              loading={loadingMore}
              style={styles.loadMoreButton}
            />
          ) : null
        }
      />
    </Screen>
  )
}

function ProductRow({ product, theme, styles }: { product: InventoryProduct; theme: Theme; styles: Styles }) {
  const metaParts = [product.brand_name, product.strength].filter((v): v is string => !!v)
  const badges = product.status_badges.filter((b) => b !== "ok")
  const hasCost = typeof product.cost_price === "number"

  return (
    <Card style={styles.productCard}>
      <View style={styles.productHeaderRow}>
        <View style={styles.productNameCol}>
          <Text style={styles.productName} numberOfLines={1}>
            {product.name}
          </Text>
          {metaParts.length > 0 ? (
            <Text style={styles.productMeta} numberOfLines={1}>
              {metaParts.join(" · ")}
            </Text>
          ) : null}
        </View>
        <View style={styles.priceCol}>
          <Text style={styles.priceText}>
            {typeof product.selling_price === "number" ? formatKES(Math.round(product.selling_price * 100)) : "—"}
          </Text>
          {hasCost ? (
            <Text style={styles.costText}>Cost {formatKES(Math.round(product.cost_price! * 100))}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.productFooterRow}>
        <Text style={styles.stockText}>{product.stock_on_hand ?? 0} in stock</Text>
        {badges.length > 0 ? (
          <View style={styles.badgeRow}>
            {badges.map((code) => {
              const b = badgeFor(code)
              return <StatusBadge key={code} status={b.status} label={b.label} />
            })}
          </View>
        ) : null}
      </View>
    </Card>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
    label: { fontSize: 15, color: theme.text },
    error: { color: theme.red },
    errorCard: { gap: 8 },
    inlineError: { color: theme.red, fontSize: 13 },

    listContent: { paddingBottom: 24 },
    header: { gap: 10, marginBottom: 12 },
    title: { fontSize: 20, fontWeight: "700", color: theme.text },

    searchInput: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontSize: 15,
      backgroundColor: theme.surface,
      color: theme.text,
    },

    filterRow: { gap: 8, paddingVertical: 2 },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.muted,
    },
    chipActive: { backgroundColor: theme.greenCta, borderColor: theme.greenCta },
    chipText: { fontSize: 13, fontWeight: "600", color: theme.textSecondary },
    chipTextActive: { color: "#fff" },

    summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

    rowGap: { height: 8 },
    productCard: { gap: 8 },
    productHeaderRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    productNameCol: { flex: 1, gap: 2 },
    productName: { fontSize: 15, fontWeight: "600", color: theme.text },
    productMeta: { fontSize: 12, color: theme.textSecondary },
    priceCol: { alignItems: "flex-end", gap: 2 },
    priceText: { fontSize: 15, fontWeight: "700", color: theme.text },
    costText: { fontSize: 12, color: theme.textTertiary },
    productFooterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
    stockText: { fontSize: 13, color: theme.textSecondary },
    badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, flexShrink: 1, justifyContent: "flex-end" },

    loadMoreButton: { marginTop: 12 },
  })
}

type Styles = ReturnType<typeof createStyles>
