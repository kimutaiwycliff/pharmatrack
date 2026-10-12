import Ionicons from "@expo/vector-icons/Ionicons"
import { router } from "expo-router"
import { StyleSheet, View } from "react-native"
import { Button, EmptyState, ErrorState, NeedsInternet, SkeletonList, StatusBadge, Text, useIsOnline } from "../../../components"
import { useCan } from "../../../hooks/useCan"
import { useQuery } from "../../../hooks/useQuery"
import { apiJson } from "../../../lib/api"
import { env } from "../../../lib/env"
import { getLocalSaleDetail } from "../../../repo/sales"
import { useSessionStore } from "../../../store/session"
import { useStaffStore } from "../../../store/staff"
import { useSyncStore } from "../../../store/sync"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { ReceiptView } from "../../pos/components/ReceiptView"
import type { ReceiptData } from "../../pos/logic/receipt"
import { cashierName, readOutboxSale } from "../data/localSales"
import { outboxSaleToReceipt, type LocalSaleStatus } from "../logic/outboxSale"
import { saleDetailToReceipt, saleStatusBadge, type SaleDetail } from "../logic/receiptMapping"

const OFFLINE_EDITION = env.EXPO_PUBLIC_OFFLINE_MODE

/** Where a sale lives: the server (or the Offline Edition's local ledger), or this phone's sync outbox. */
export type SaleSource = "server" | "outbox"

export interface SaleSelection {
  id: string
  source: SaleSource
}

interface Loaded {
  receipt: ReceiptData
  serverStatus: string | null
  localStatus: LocalSaleStatus | null
  errorMessage: string | null
  customerPhone: string | null
}

// The receipt for one sale in Sales history — /sales/[id] on phones, the right
// pane on tablets. Server sales come from GET /api/sales/[id] (cashiers only
// get their own, the route 404s others); the Offline Edition reads its local
// ledger (repo/sales.ts getLocalSaleDetail); a sale still in the outbox is
// rebuilt from its queued payload, so it reprints with no connection.
export function SaleReceipt({ id, source }: SaleSelection) {
  const theme = useTheme()
  const online = useIsOnline()
  const can = useCan()
  const viewAll = can("sales.view_all")
  const staffId = useStaffStore((s) => s.current?.id ?? null)
  const staffName = useStaffStore((s) => s.current?.name ?? "—")
  const branchId = useSessionStore((s) => s.branchId)
  const branches = useSessionStore((s) => s.branches)
  const shopName = branches.find((b) => b.id === branchId)?.name ?? "PharmaTrack"
  // Re-read an outbox sale whenever the sync engine moves something.
  const syncVersion = useSyncStore((s) => `${s.pendingSales}:${s.rejectedCount}:${s.lastSyncAt ?? 0}`)

  const fromServer = source === "server"
  const key = fromServer
    ? !OFFLINE_EDITION && !online
      ? null
      : `sale:${id}`
    : `outbox-sale:${id}:${syncVersion}`

  const q = useQuery<Loaded | null>(key, async () => {
    if (!fromServer) {
      const s = readOutboxSale(id)
      // Same rule the server applies: without sales.view_all you only see your own.
      if (!s || (!viewAll && s.payload.cashier_id !== staffId)) return null
      return {
        receipt: outboxSaleToReceipt(s.payload, {
          shopName,
          cashier: cashierName(s.payload.cashier_id, s.payload.cashier_id === staffId ? staffName : "—"),
        }),
        serverStatus: null,
        localStatus: s.status,
        errorMessage: s.errorMessage,
        customerPhone: s.payload.customer_phone,
      }
    }
    const detail: SaleDetail | null = OFFLINE_EDITION ? await getLocalSaleDetail(id) : await apiJson<SaleDetail>(`/api/sales/${id}`)
    if (!detail) return null
    return {
      receipt: saleDetailToReceipt(detail, shopName),
      serverStatus: detail.sale.status ?? null,
      localStatus: null,
      errorMessage: null,
      customerPhone: detail.sale.customer_phone ?? null,
    }
  })

  if (!key) return <NeedsInternet feature="This receipt" />
  if (q.loading) return <SkeletonList rows={6} />
  if (q.error) {
    // The route answers 404 "Sale not found" for someone else's sale too.
    return <ErrorState message={q.error} onRetry={q.retry} />
  }
  if (!q.data) {
    return (
      <EmptyState
        icon={<Ionicons name="receipt-outline" size={32} color={theme.textTertiary} />}
        title="Sale not found"
        message="It may belong to another cashier, or it was removed from this phone."
      />
    )
  }

  const d = q.data
  const badge = d.serverStatus ? saleStatusBadge(d.serverStatus) : null
  const status = (
    <View style={styles.status}>
      {badge ? <StatusBadge status={badge.status} label={badge.label} /> : null}
      {d.localStatus === "pending" ? (
        <>
          <StatusBadge status="warning" label="Waiting to sync" />
          <Text variant="caption" tone="secondary">
            Saved on this phone. It uploads automatically when you&apos;re back online.
          </Text>
        </>
      ) : null}
      {d.localStatus === "synced" ? <StatusBadge status="ok" label="Synced" /> : null}
      {d.localStatus === "dismissed" ? <StatusBadge status="neutral" label="Dismissed" /> : null}
      {d.localStatus === "rejected" ? (
        <>
          <StatusBadge status="danger" label="Not accepted by the server" />
          {d.errorMessage ? (
            <Text variant="caption" tone="danger">
              {d.errorMessage}
            </Text>
          ) : null}
          <Button
            title="Open sync issues"
            variant="secondary"
            size="sm"
            onPress={() => router.push("/sync-issues")}
            accessibilityLabel="Open sync issues to resolve this sale"
            leadingIcon={<Ionicons name="alert-circle-outline" size={18} color={theme.text} />}
            style={styles.issuesButton}
          />
        </>
      ) : null}
    </View>
  )

  return (
    <ReceiptView
      key={`${source}:${id}`}
      receipt={d.receipt}
      queued={false}
      showSyncState={false}
      mode="reprint"
      status={status}
      initialPhone={d.customerPhone}
    />
  )
}

const styles = StyleSheet.create({
  status: { gap: space.xs, alignItems: "flex-start" },
  issuesButton: { alignSelf: "flex-start" },
})
