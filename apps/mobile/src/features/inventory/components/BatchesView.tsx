import { useMemo, useState } from "react"
import { RefreshControl, StyleSheet, View } from "react-native"
import { router } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import Ionicons from "@expo/vector-icons/Ionicons"
import {
  Button,
  EmptyState,
  ErrorState,
  ListRow,
  Money,
  NeedsInternet,
  ScreenHeader,
  SkeletonList,
  StatusBadge,
  Text,
  useIsOnline,
} from "../../../components"
import { useCan } from "../../../hooks/useCan"
import { useQuery } from "../../../hooks/useQuery"
import { formatDay } from "../../../lib/dates"
import { env } from "../../../lib/env"
import { useBranchScope } from "../../../store/branchScope"
import { useSessionStore } from "../../../store/session"
import { useTheme } from "../../../theme/useTheme"
import { radius, space } from "../../../theme/tokens"
import { fetchBatches, useInventoryVersion } from "../data"
import { expiryInfo } from "../logic/expiry"
import { sortFefo, totalRemaining } from "../logic/fefo"
import type { Batch } from "../logic/types"
import { AdjustStockSheet } from "./AdjustStockSheet"
import { EditBatchSheet } from "./EditBatchSheet"

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE

interface BatchesViewProps {
  productId: string
  productName: string
  /** "screen" = phone route with a back header; "pane" = tablet detail pane. */
  variant: "screen" | "pane"
}

type SheetState = { kind: "adjust" | "edit"; batch: Batch; open: boolean } | null

// A product's batches in FEFO order (what sells next on top) — mirrors web's
// BatchesSheet: expiry colouring, quantities in base units, cost per unit only
// with cost.view, the branch of each batch in the "All branches" view, and
// per-batch Edit (stock.receive, online) / Adjust stock (stock.adjust).
// Used by app/product-batches.tsx (phones) and the Inventory tab's tablet
// detail pane. Offline Edition: repo/inventory.ts for the session branch.
export function BatchesView({ productId, productName, variant }: BatchesViewProps) {
  const theme = useTheme()
  const can = useCan()
  const online = useIsOnline()
  const scope = useBranchScope()
  const sessionBranchId = useSessionStore((s) => s.branchId)
  const version = useInventoryVersion((s) => s.batches)
  const bumpList = useInventoryVersion((s) => s.bumpList)
  const [sheet, setSheet] = useState<SheetState>(null)

  const branchId = OFFLINE ? (sessionBranchId ?? undefined) : scope.branchId
  const showBranch = !OFFLINE && scope.isAll
  const canSeeCost = can("cost.view")
  const canReceive = can("stock.receive")
  const canAdjust = can("stock.adjust")
  const canEdit = canReceive && !OFFLINE

  const key = OFFLINE || online ? `batches:${productId}:${branchId ?? "all"}:${version}` : null
  const q = useQuery(key, () => fetchBatches(productId, branchId))
  const batches = useMemo(() => sortFefo(q.data ?? []), [q.data])
  const units = totalRemaining(batches)
  const inStock = batches.filter((b) => b.quantity_remaining > 0).length

  function afterChange() {
    q.refresh()
    bumpList()
  }

  function receive() {
    router.push({ pathname: "/receive-stock", params: { productId } })
  }

  const title =
    variant === "screen" ? (
      <ScreenHeader title={productName || "Batches"} subtitle={showBranch ? "All branches" : null} />
    ) : (
      <View style={styles.paneHead}>
        <Text variant="title" accessibilityRole="header" numberOfLines={2}>
          {productName || "Batches"}
        </Text>
        {showBranch ? (
          <Text variant="caption" tone="secondary">
            All branches
          </Text>
        ) : null}
      </View>
    )

  if (!OFFLINE && !online) {
    return (
      <View style={styles.flex}>
        {title}
        <NeedsInternet feature="Batches" />
      </View>
    )
  }

  const header = (
    <View style={styles.header}>
      {batches.length > 0 ? (
        <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.stat}>
            <Text variant="caption" tone="secondary">
              In stock
            </Text>
            <Text variant="headline" tabular>
              {units.toLocaleString("en-KE")}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="caption" tone="secondary">
              Batches with stock
            </Text>
            <Text variant="headline" tabular>
              {inStock} of {batches.length}
            </Text>
          </View>
        </View>
      ) : null}
      {canReceive ? (
        <Button
          title="Receive stock"
          onPress={receive}
          leadingIcon={<Ionicons name="add-circle-outline" size={20} color={theme.onAccent} />}
        />
      ) : null}
      {q.error && q.data ? <ErrorState compact message={q.error} onRetry={q.retry} /> : null}
      {batches.length > 0 ? (
        <Text variant="label" tone="secondary">
          Sells first at the top (earliest expiry)
        </Text>
      ) : null}
    </View>
  )

  return (
    <View style={styles.flex}>
      {title}
      {q.loading ? (
        <SkeletonList rows={4} />
      ) : q.error && !q.data ? (
        <ErrorState message={q.error} onRetry={q.retry} />
      ) : (
        <FlashList keyboardShouldPersistTaps="handled"
          data={batches}
          keyExtractor={(b) => b.id}
          ListHeaderComponent={header}
          refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={theme.green} colors={[theme.green]} />}
          renderItem={({ item, index }) => (
            <BatchRow
              batch={item}
              position={index + 1}
              showBranch={showBranch}
              showCost={canSeeCost}
              onAdjust={canAdjust ? () => setSheet({ kind: "adjust", batch: item, open: true }) : undefined}
              onEdit={canEdit ? () => setSheet({ kind: "edit", batch: item, open: true }) : undefined}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<Ionicons name="cube-outline" size={32} color={theme.textTertiary} />}
              title="No batches yet"
              message={showBranch ? "No branch has received this product." : "Nothing received for this product at this branch."}
              action={canReceive ? { label: "Receive stock", onPress: receive } : undefined}
            />
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      <AdjustStockSheet
        batch={sheet?.kind === "adjust" ? sheet.batch : null}
        open={sheet?.kind === "adjust" && sheet.open}
        onClose={() => setSheet((s) => (s ? { ...s, open: false } : s))}
        onSaved={afterChange}
      />
      {canEdit ? (
        <EditBatchSheet
          batch={sheet?.kind === "edit" ? sheet.batch : null}
          open={sheet?.kind === "edit" && sheet.open}
          canSeeCost={canSeeCost}
          onClose={() => setSheet((s) => (s ? { ...s, open: false } : s))}
          onSaved={afterChange}
        />
      ) : null}
    </View>
  )
}

interface BatchRowProps {
  batch: Batch
  position: number
  showBranch: boolean
  showCost: boolean
  onAdjust?: () => void
  onEdit?: () => void
}

function BatchRow({ batch, position, showBranch, showCost, onAdjust, onEdit }: BatchRowProps) {
  const theme = useTheme()
  const exp = expiryInfo(batch.expiry_date)
  const empty = batch.quantity_remaining <= 0
  const cost = showCost && batch.cost_price != null && batch.cost_price !== "" ? Number(batch.cost_price) : null
  const details = [
    `Exp ${batch.expiry_date ? formatDay(batch.expiry_date.slice(0, 10)) : "—"}`,
    batch.received_at ? `Received ${formatDay(batch.received_at)}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <ListRow
      title={`${position}. ${batch.batch_number}`}
      subtitle={showBranch ? (batch.branch_name ?? "Unknown branch") : null}
      accessibilityLabel={`Batch ${batch.batch_number}${showBranch && batch.branch_name ? `, ${batch.branch_name}` : ""}. ${exp.label}. ${batch.quantity_remaining} of ${batch.quantity_received} left`}
      style={empty ? { opacity: 0.6 } : undefined}
      meta={
        <View style={styles.meta}>
          <View style={styles.badges}>
            <StatusBadge status={exp.status} label={exp.label} />
            {empty ? <StatusBadge status="neutral" label="Used up" /> : null}
          </View>
          <Text variant="caption" tone={exp.kind === "expired" ? "danger" : exp.kind === "soon" ? "warning" : "secondary"}>
            {details}
          </Text>
          {cost != null && Number.isFinite(cost) ? (
            <Text variant="caption" tone="secondary">
              Cost per unit <Money cents={Math.round(cost * 100)} variant="caption" tone="secondary" />
            </Text>
          ) : null}
          {onAdjust || onEdit ? (
            <View style={styles.rowActions}>
              {onAdjust ? (
                <Button
                  title="Adjust stock"
                  size="sm"
                  variant="secondary"
                  onPress={onAdjust}
                  accessibilityLabel={`Adjust stock for batch ${batch.batch_number}`}
                  leadingIcon={<Ionicons name="swap-vertical-outline" size={16} color={theme.text} />}
                />
              ) : null}
              {onEdit ? (
                <Button
                  title="Edit"
                  size="sm"
                  variant="ghost"
                  onPress={onEdit}
                  accessibilityLabel={`Edit batch ${batch.batch_number}`}
                  leadingIcon={<Ionicons name="create-outline" size={16} color={theme.text} />}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      }
      trailing={
        <View style={styles.qty}>
          <Text variant="headline" tabular>
            {batch.quantity_remaining.toLocaleString("en-KE")}
          </Text>
          <Text variant="caption" tone="tertiary" tabular>
            of {batch.quantity_received.toLocaleString("en-KE")}
          </Text>
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  paneHead: { gap: space.xxs, marginBottom: space.md, minHeight: 48, justifyContent: "center" },
  header: { gap: space.md, marginBottom: space.sm },
  summary: { flexDirection: "row", borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.lg },
  stat: { flex: 1, gap: space.xxs },
  listContent: { paddingBottom: space.xxl },
  meta: { gap: space.xs, marginTop: space.xxs },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  rowActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xxs },
  qty: { alignItems: "flex-end" },
})
