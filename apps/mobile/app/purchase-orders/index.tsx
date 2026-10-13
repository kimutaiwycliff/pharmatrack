import Ionicons from "@expo/vector-icons/Ionicons"
import { FlashList } from "@shopify/flash-list"
import { router, useFocusEffect } from "expo-router"
import { useCallback, useRef, useState } from "react"
import { ScrollView, StyleSheet, View } from "react-native"
import {
  BranchSwitcher, Chip, EmptyState, ErrorState, IconButton, MasterDetail, NeedsInternet, Screen, ScreenHeader,
  SkeletonList, useIsOnline,
} from "../../src/components"
import { OrderDetail } from "../../src/features/purchasing/components/OrderDetail"
import { OrderRow } from "../../src/features/purchasing/components/OrderRow"
import { PO_FILTERS, type PoFilter } from "../../src/features/purchasing/logic/status"
import type { PurchaseOrderSummary } from "../../src/features/purchasing/logic/types"
import { useCan } from "../../src/hooks/useCan"
import { useIsTablet } from "../../src/hooks/useIsTablet"
import { useApiQuery } from "../../src/hooks/useQuery"
import { withQuery } from "../../src/lib/api"
import { useBranchScope } from "../../src/store/branchScope"
import { useTheme } from "../../src/theme/useTheme"
import { space } from "../../src/theme/tokens"

// Purchase orders (online only) — mirrors apps/web/app/(dashboard)/purchase-
// orders/page.tsx: status chips (default "Open"), branch scope, newest first.
// GET /api/purchase-orders returns up to 200 orders in one go (no paging);
// totals only arrive for cost.view. Tablets show the order beside the list.
export default function PurchaseOrdersScreen() {
  const online = useIsOnline()
  const can = useCan()
  const allowed = can("purchasing.manage") || can("purchasing.receive")

  if (!online) {
    return (
      <Screen>
        <ScreenHeader title="Purchase orders" />
        <NeedsInternet feature="Purchase orders" />
      </Screen>
    )
  }
  if (!allowed) {
    return (
      <Screen>
        <ScreenHeader title="Purchase orders" />
        <EmptyState icon={<LockIcon />} message="You don't have access to purchase orders. Ask your manager." />
      </Screen>
    )
  }
  return <OrdersList />
}

function LockIcon() {
  const theme = useTheme()
  return <Ionicons name="lock-closed-outline" size={36} color={theme.textTertiary} />
}

function OrdersList() {
  const theme = useTheme()
  const can = useCan()
  const canManage = can("purchasing.manage")
  const isTablet = useIsTablet()
  const scope = useBranchScope()
  const [filter, setFilter] = useState<PoFilter>("open")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const q = useApiQuery<{ orders: PurchaseOrderSummary[] }>(withQuery("/api/purchase-orders", { status: filter, branch_id: scope.branchId }))
  const orders = q.data?.orders ?? []

  // Coming back from an order (received / sent / cancelled) → refresh.
  const seen = useRef(false)
  const refresh = q.refresh
  useFocusEffect(
    useCallback(() => {
      if (seen.current) refresh()
      seen.current = true
    }, [refresh]),
  )

  const filterLabel = PO_FILTERS.find((f) => f.key === filter)?.label ?? ""
  const openSuggestions = () => router.push("/purchase-orders/suggestions")

  const list = (
    <View style={styles.flex}>
      <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipBar}>
        {PO_FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} accessibilityLabel={`Show ${f.label.toLowerCase()} orders`} />
        ))}
      </ScrollView>
      {q.loading ? (
        <SkeletonList rows={7} />
      ) : q.error && !q.data ? (
        <ErrorState message={q.error} onRetry={q.retry} />
      ) : (
        <FlashList keyboardShouldPersistTaps="handled"
          data={orders}
          keyExtractor={(o) => o.id}
          refreshing={q.refreshing}
          onRefresh={q.refresh}
          ListHeaderComponent={q.error ? <ErrorState compact message={q.error} onRetry={q.retry} /> : null}
          renderItem={({ item }) => (
            <OrderRow
              order={item}
              showBranch={scope.isAll}
              selected={isTablet && item.id === selectedId}
              onPress={() => (isTablet ? setSelectedId(item.id) : router.push({ pathname: "/purchase-orders/[id]", params: { id: item.id } }))}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<Ionicons name="clipboard-outline" size={36} color={theme.textTertiary} />}
              title={`No ${filter === "all" ? "" : `${filterLabel.toLowerCase()} `}purchase orders`}
              message={
                canManage
                  ? "Restock suggestions look at what's running low and how fast it sells, then draft an order per supplier."
                  : "Orders your manager creates will show here for you to check deliveries in."
              }
              action={
                canManage
                  ? { label: "Restock suggestions", onPress: openSuggestions }
                  : filter !== "all"
                    ? { label: "Show all orders", onPress: () => setFilter("all") }
                    : undefined
              }
            />
          }
        />
      )}
    </View>
  )

  return (
    <Screen>
      <ScreenHeader
        title="Purchase orders"
        subtitle={scope.canSwitch ? scope.label : null}
        right={
          <>
            <BranchSwitcher />
            {canManage ? <IconButton icon="sparkles-outline" accessibilityLabel="Restock suggestions" onPress={openSuggestions} /> : null}
          </>
        }
      />
      {isTablet ? (
        <MasterDetail
          master={list}
          detail={
            selectedId ? (
              <OrderDetail
                key={selectedId}
                id={selectedId}
                embedded
                onChanged={q.refresh}
                onDeleted={() => setSelectedId(null)}
              />
            ) : null
          }
          placeholder={{ icon: <Ionicons name="cube-outline" size={36} color={theme.textTertiary} />, message: "Pick an order to see its lines and check a delivery in." }}
        />
      ) : (
        list
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chipBar: { flexGrow: 0, marginBottom: space.sm },
  chips: { gap: space.sm },
})
