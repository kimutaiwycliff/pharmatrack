import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { useEffect, useState } from "react"
import { BackHandler, RefreshControl, ScrollView, StyleSheet, View } from "react-native"
import {
  Button, Card, ErrorState, Money, ScreenHeader, SkeletonList, Text,
} from "../../../components"
import { useCan } from "../../../hooks/useCan"
import { useApiQuery } from "../../../hooks/useQuery"
import { apiJson, errorMessage } from "../../../lib/api"
import { formatDay, formatDateTime } from "../../../lib/dates"
import { toast } from "../../../lib/toast"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { canCancelStatus, canReceiveStatus } from "../logic/status"
import { kesToCents, packName, unitsText, type PoItem, type PurchaseOrderDetail } from "../logic/types"
import { PoStatusBadge } from "./PoStatusBadge"
import { ReceiveDelivery } from "./ReceiveDelivery"
import { confirm as askConfirm } from "../../../lib/confirm"

interface OrderDetailProps {
  id: string
  /** Tablet pane: no back button while viewing. */
  embedded?: boolean
  /** Status/lines changed (refresh the list). */
  onChanged?: () => void
  /** Draft deleted — leave the detail. */
  onDeleted?: () => void
}

type Busy = "send" | "cancel" | "delete" | null

/**
 * One purchase order: header, lines (ordered vs received, cost only with
 * cost.view — the API strips it otherwise) and the web page's actions
 * (apps/web/app/(dashboard)/purchase-orders/[id]/page.tsx): Receive delivery
 * for purchasing.receive; Mark as sent / Cancel / Delete draft for
 * purchasing.manage. PDF, WhatsApp, email and line editing stay on web.
 * Shared by the phone route and the tablet master–detail pane.
 */
export function OrderDetail({ id, embedded, onChanged, onDeleted }: OrderDetailProps) {
  const theme = useTheme()
  const can = useCan()
  const canManage = can("purchasing.manage")
  const canReceive = can("purchasing.receive")
  const canSeeCost = can("cost.view")
  const q = useApiQuery<{ order: PurchaseOrderDetail }>(`/api/purchase-orders/${id}`)
  const [mode, setMode] = useState<"view" | "receive">("view")
  const [busy, setBusy] = useState<Busy>(null)

  // Android back leaves the receive form, not the order.
  useEffect(() => {
    if (mode !== "receive") return
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setMode("view")
      return true
    })
    return () => sub.remove()
  }, [mode])

  const order = q.data?.order

  const header = (
    <ScreenHeader
      title={mode === "receive" ? "Receive delivery" : (order?.supplier_name ?? (order ? "No supplier" : "Purchase order"))}
      subtitle={order ? `${order.po_number}${order.branch_name ? ` · ${order.branch_name}` : ""}` : null}
      hideBack={embedded && mode === "view"}
      onBack={mode === "receive" ? () => setMode("view") : undefined}
    />
  )

  if (q.loading) {
    return (
      <View style={styles.flex}>
        {header}
        <SkeletonList rows={6} />
      </View>
    )
  }
  if (!order) {
    return (
      <View style={styles.flex}>
        {header}
        <ErrorState message={q.error ?? "Purchase order not found"} onRetry={q.retry} />
      </View>
    )
  }

  if (mode === "receive") {
    return (
      <View style={styles.flex}>
        {header}
        <ReceiveDelivery
          order={order}
          onCancel={() => setMode("view")}
          onDone={(updated) => {
            q.setData((d) => (d ? { ...d, order: updated } : d))
            setMode("view")
            onChanged?.()
          }}
        />
      </View>
    )
  }

  async function patch(action: "send" | "cancel", success: string) {
    setBusy(action)
    try {
      const res = await apiJson<{ order: PurchaseOrderDetail }>(`/api/purchase-orders/${id}`, { method: "PATCH", body: { action } })
      q.setData((d) => (d ? { ...d, order: res.order } : d))
      toast.success(success)
      onChanged?.()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function confirmCancel(o: PurchaseOrderDetail) {
    const ok = await askConfirm({
      title: `Cancel ${o.po_number}?`,
      message:
        o.status === "partially_received"
          ? "Stock already received stays in inventory; nothing more will be expected."
          : "The supplier won't be notified automatically — let them know too.",
      cancelLabel: "Keep order",
      confirmLabel: "Cancel order",
      destructive: true,
    })
    if (ok) void patch("cancel", "Order cancelled")
  }

  async function confirmDelete(o: PurchaseOrderDetail) {
    const ok = await askConfirm({
      title: "Delete draft?",
      message: `Delete draft ${o.po_number}? This can't be undone.`,
      cancelLabel: "Keep",
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return
    setBusy("delete")
    apiJson(`/api/purchase-orders/${id}`, { method: "DELETE" })
      .then(() => {
        toast.success("Draft deleted")
        onChanged?.()
        onDeleted?.()
      })
      .catch((err: unknown) => toast.error(errorMessage(err)))
      .finally(() => setBusy(null))
  }

  const receivable = canReceive && canReceiveStatus(order.status) && order.items.some((i) => i.product_id)
  const totalCents = canSeeCost ? kesToCents(order.total) : null
  const dates = [
    `Created ${formatDay(order.created_at)}${order.created_by_name ? ` by ${order.created_by_name}` : ""}`,
    order.expected_date && order.status !== "received" ? `Needed by ${formatDay(order.expected_date)}` : null,
    order.sent_at ? `Sent ${formatDateTime(order.sent_at)}` : null,
    order.received_at ? `Received ${formatDateTime(order.received_at)}` : null,
  ].filter(Boolean) as string[]

  return (
    <View style={styles.flex}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} colors={[theme.green]} tintColor={theme.green} />}
      >
        {q.error ? <ErrorState compact message={q.error} onRetry={q.retry} /> : null}
        <View style={styles.meta}>
          <PoStatusBadge status={order.status} />
          {dates.map((d) => (
            <Text key={d} variant="caption" tone="secondary">
              {d}
            </Text>
          ))}
        </View>

        {receivable || canManage ? (
          <View style={styles.actions}>
            {receivable ? (
              <Button
                title="Receive delivery"
                onPress={() => setMode("receive")}
                disabled={!!busy}
                leadingIcon={<Ionicons name="cube-outline" size={18} color={theme.onAccent} />}
              />
            ) : null}
            {canManage && order.status === "draft" ? (
              <Button
                title="Mark as sent"
                variant="secondary"
                onPress={() => void patch("send", "Marked as sent")}
                loading={busy === "send"}
                disabled={!!busy}
                leadingIcon={<Ionicons name="paper-plane-outline" size={18} color={theme.text} />}
              />
            ) : null}
            {canManage && canCancelStatus(order.status) ? (
              <Button title="Cancel order" variant="ghost" onPress={() => confirmCancel(order)} loading={busy === "cancel"} disabled={!!busy} />
            ) : null}
            {canManage && order.status === "draft" ? (
              <Button title="Delete draft" variant="ghost" onPress={() => confirmDelete(order)} loading={busy === "delete"} disabled={!!busy} />
            ) : null}
          </View>
        ) : null}

        <Card style={styles.lines}>
          {order.items.map((i, n) => (
            <LineRow key={i.id} item={i} canSeeCost={canSeeCost} last={n === order.items.length - 1} />
          ))}
          <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
            <Text tone="secondary" style={styles.flex}>
              {order.items.length} item{order.items.length === 1 ? "" : "s"}
            </Text>
            {totalCents != null ? (
              <Text variant="bodyStrong">
                Total <Money cents={totalCents} />
              </Text>
            ) : null}
          </View>
        </Card>

        {order.notes ? (
          <Card>
            <Text variant="label" tone="secondary">
              Notes
            </Text>
            <Text>{order.notes}</Text>
          </Card>
        ) : null}
      </ScrollView>
    </View>
  )
}

function LineRow({ item: i, canSeeCost, last }: { item: PoItem; canSeeCost: boolean; last: boolean }) {
  const theme = useTheme()
  const complete = i.quantity_received >= i.quantity_ordered
  const lineCents = canSeeCost ? kesToCents(i.line_total) : null
  const costCents = canSeeCost ? kesToCents(i.unit_cost) : null
  const name = `${i.product_name}${i.product_strength ? ` ${i.product_strength}` : ""}`
  const pack = `${packName(i)}${i.units_per_pack > 1 ? ` · ${i.units_per_pack} ${i.base_unit ?? "unit"}s per pack` : ""}`
  const stock = i.stock_on_hand != null ? `${unitsText(i.stock_on_hand, i.base_unit)} on hand` : "Product deleted"
  return (
    <View
      style={[styles.line, !last && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
      accessible
      accessibilityLabel={`${name}. Ordered ${i.quantity_ordered}, received ${i.quantity_received}. ${pack}. ${stock}`}
    >
      <View style={styles.flex}>
        <Text variant="bodyStrong">{name}</Text>
        <Text variant="caption" tone="secondary">
          {pack}
        </Text>
        <Text variant="caption" tone={i.stock_on_hand == null ? "danger" : "tertiary"}>
          {stock}
          {costCents != null ? ` · ${formatKES(costCents)}/pack` : ""}
        </Text>
      </View>
      <View style={styles.qty}>
        <Text variant="caption" tone="secondary">
          Ordered {i.quantity_ordered}
        </Text>
        <Text variant="label" tone={complete ? "success" : i.quantity_received > 0 ? "warning" : "tertiary"} tabular>
          Received {i.quantity_received}
        </Text>
        {lineCents != null ? <Money cents={lineCents} variant="label" /> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: space.md, paddingBottom: space.xxl },
  meta: { gap: space.xxs },
  actions: { gap: space.sm },
  lines: { padding: 0 },
  line: { flexDirection: "row", gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md },
  qty: { alignItems: "flex-end", gap: space.xxs },
  totalRow: { flexDirection: "row", alignItems: "center", padding: space.md, borderTopWidth: StyleSheet.hairlineWidth },
})
