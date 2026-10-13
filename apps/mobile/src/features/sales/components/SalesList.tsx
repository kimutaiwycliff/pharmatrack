import Ionicons from "@expo/vector-icons/Ionicons"
import { FlashList } from "@shopify/flash-list"
import { useEffect, useMemo, useState } from "react"
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native"
import { Chip, EmptyState, ErrorState, IconButton, NeedsInternet, SkeletonList, Text, TextField, useIsOnline } from "../../../components"
import { useCan } from "../../../hooks/useCan"
import { usePagedQuery } from "../../../hooks/useQuery"
import { apiJson, withQuery } from "../../../lib/api"
import { env } from "../../../lib/env"
import { listLocalSales } from "../../../repo/sales"
import { useBranchScope } from "../../../store/branchScope"
import { useSessionStore } from "../../../store/session"
import { useStaffStore } from "../../../store/staff"
import { useSyncStore } from "../../../store/sync"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { cashierName, readUnsyncedSales } from "../data/localSales"
import { currentRange, DATE_CHIPS, type DateChip } from "../logic/dateRange"
import { matchesReceiptQuery } from "../logic/outboxSale"
import type { SaleRow, SalesResponse } from "../logic/receiptMapping"
import { LocalSaleListRow, ServerSaleRow } from "./SaleRows"
import type { SaleSelection } from "./SaleReceipt"

const OFFLINE_EDITION = env.EXPO_PUBLIC_OFFLINE_MODE
const PAGE_SIZE = 25
const DEFAULT_CHIP: DateChip = "7d"

interface SalesListProps {
  /** `${source}:${id}` of the sale shown on the right (tablet), for highlighting. */
  selectedKey?: string | null
  onSelect: (sale: SaleSelection) => void
}

// Sales history list. Online: GET /api/sales (apps/web/app/api/sales/route.ts —
// q matches the receipt number only; from/to bound created_at; the server
// already limits people without sales.view_all to their own sales and pins
// branch-locked staff to their branch). On top, this phone's sales the server
// hasn't accepted yet, straight from the sync outbox — those show with no
// connection, when the server list is replaced by a "needs internet" notice.
// Offline Edition: the local ledger (repo/sales.ts listLocalSales), no outbox.
export function SalesList({ selectedKey, onSelect }: SalesListProps) {
  const theme = useTheme()
  const online = useIsOnline()
  const can = useCan()
  const viewAll = can("sales.view_all")
  const scope = useBranchScope()
  const sessionBranchId = useSessionStore((s) => s.branchId)
  const staff = useStaffStore((s) => s.current)

  const [rawSearch, setRawSearch] = useState("")
  const [q, setQ] = useState("")
  const [chip, setChip] = useState<DateChip>(DEFAULT_CHIP)
  // Computed when a chip is picked (and on pull-to-refresh), not every render,
  // so the query key stays stable while the screen is open.
  const [range, setRange] = useState(() => currentRange(DEFAULT_CHIP))

  useEffect(() => {
    const t = setTimeout(() => setQ(rawSearch.trim()), 300)
    return () => clearTimeout(t)
  }, [rawSearch])

  const key = OFFLINE_EDITION
    ? sessionBranchId
      ? `local-sales|${sessionBranchId}|${range.from}|${range.to}|${q}`
      : null
    : online
      ? withQuery("/api/sales", { branch_id: scope.branchId, from: range.from, to: range.to, q, limit: PAGE_SIZE })
      : null

  const paged = usePagedQuery<SaleRow>(key, async (page) => {
    if (OFFLINE_EDITION) {
      const r = await listLocalSales({ branchId: sessionBranchId ?? "", from: range.from, to: range.to, q, page, limit: PAGE_SIZE })
      return { items: r.sales, total: r.total }
    }
    const r = await apiJson<SalesResponse>(
      withQuery("/api/sales", { branch_id: scope.branchId, from: range.from, to: range.to, q, page, limit: PAGE_SIZE }),
    )
    return { items: r.sales, total: r.total }
  })

  // Outbox sales — re-read whenever the sync engine moves something, or on pull-to-refresh.
  const syncVersion = useSyncStore((s) => `${s.pendingSales}:${s.rejectedCount}:${s.lastSyncAt ?? 0}`)
  const [localTick, setLocalTick] = useState(0)
  const allUnsynced = useMemo(() => {
    void syncVersion
    void localTick
    return OFFLINE_EDITION ? [] : readUnsyncedSales()
  }, [syncVersion, localTick])
  const unsynced = allUnsynced.filter((s) => (viewAll || s.cashierId === staff?.id) && matchesReceiptQuery(s, q))

  function pickChip(c: DateChip) {
    setChip(c)
    setRange(currentRange(c))
  }

  function onRefresh() {
    setLocalTick((t) => t + 1)
    const next = currentRange(chip)
    // Past midnight "Today" means a new day — a new key reloads by itself.
    if (next.from !== range.from || next.to !== range.to) setRange(next)
    else if (key) paged.refresh()
  }

  const cashierFor = (id: string) => (viewAll ? cashierName(id, id === staff?.id ? staff.name : "—") : null)

  const header = (
    <View style={styles.headerGap}>
      {unsynced.length > 0 ? (
        <View>
          <View style={styles.sectionTitle}>
            <Ionicons name="cloud-upload-outline" size={18} color={theme.amber} />
            <Text variant="label" tone="secondary" accessibilityRole="header">
              On this phone, not synced yet ({unsynced.length})
            </Text>
          </View>
          {unsynced.map((s) => (
            <LocalSaleListRow
              key={s.clientId}
              sale={s}
              cashier={cashierFor(s.cashierId)}
              selected={selectedKey === `outbox:${s.clientId}`}
              onPress={() => onSelect({ id: s.clientId, source: "outbox" })}
            />
          ))}
        </View>
      ) : null}
      {key && !paged.loading && paged.items.length > 0 ? (
        <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.sectionPad}>
          {paged.total} sale{paged.total === 1 ? "" : "s"}
          {!OFFLINE_EDITION && scope.canSwitch ? ` · ${scope.label}` : ""}
        </Text>
      ) : null}
      {paged.error && paged.items.length > 0 ? <ErrorState compact message={paged.error} onRetry={paged.retry} /> : null}
    </View>
  )

  let empty
  if (!key) {
    empty = OFFLINE_EDITION ? null : <NeedsInternet feature="Sales history" />
  } else if (paged.loading) {
    empty = <SkeletonList rows={6} />
  } else if (paged.error) {
    empty = <ErrorState message={paged.error} onRetry={paged.retry} />
  } else {
    empty = (
      <EmptyState
        icon={<Ionicons name="receipt-outline" size={32} color={theme.textTertiary} />}
        title="No sales"
        message={q ? `No receipt matches "${q}" in this period.` : "No sales in this period."}
        action={
          q
            ? { label: "Clear search", onPress: () => setRawSearch("") }
            : chip !== "30d"
              ? { label: "Show last 30 days", onPress: () => pickChip("30d") }
              : undefined
        }
      />
    )
  }

  return (
    <View style={styles.flex}>
      <View style={styles.filters}>
        <TextField
          label="Search sales"
          hideLabel
          placeholder="Search receipt number"
          value={rawSearch}
          onChangeText={setRawSearch}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          leading={<Ionicons name="search" size={18} color={theme.textTertiary} />}
          trailing={rawSearch ? <IconButton icon="close-circle" accessibilityLabel="Clear search" onPress={() => setRawSearch("")} /> : null}
        />
        <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {DATE_CHIPS.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              selected={chip === c.id}
              onPress={() => pickChip(c.id)}
              accessibilityLabel={`Show sales: ${c.label}`}
            />
          ))}
        </ScrollView>
      </View>
      <FlashList
        data={key ? paged.items : []}
        keyExtractor={(s) => s.id}
        extraData={selectedKey}
        renderItem={({ item }) => (
          <ServerSaleRow
            sale={item}
            showCashier={viewAll}
            selected={selectedKey === `server:${item.id}`}
            onPress={() => onSelect({ id: item.id, source: "server" })}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={paged.loadingMore ? <ActivityIndicator style={styles.footer} color={theme.green} /> : null}
        onEndReached={paged.loadMore}
        onEndReachedThreshold={0.4}
        refreshing={paged.refreshing}
        onRefresh={onRefresh}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filters: { gap: space.sm, marginBottom: space.sm },
  chips: { gap: space.sm },
  headerGap: { gap: space.sm, marginBottom: space.xs },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.xs },
  sectionPad: { paddingTop: space.xs },
  footer: { paddingVertical: space.lg },
})
