import { useEffect, useState } from "react"
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { apiFetch } from "../src/lib/api-fetch"
import { useSessionStore } from "../src/store/session"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Card, EmptyState, Screen, ScreenHeader, StatusBadge } from "../src/components"

// Mirrors apps/web/app/api/sales/route.ts's GET response shape exactly
// (verified against that file directly, not from memory) — only the fields
// this list view actually renders. Every role including cashier can call this
// endpoint: the server already scopes cashiers to their own sales
// (`ctx.role === "cashier" ? eq(sale.cashier_id, ctx.userId) : undefined`),
// so there's no client-side role gate here (unlike staff.tsx/reports.tsx).
interface SaleRow {
  id: string
  receipt_number: string
  created_at: string
  payment_method: string
  total_amount: number
  cashier_name: string
  item_count: number
}

interface SalesResponse {
  sales: SaleRow[]
  total: number
  page: number
  limit: number
}

// Mirrors apps/web/app/api/sales/[id]/route.ts's GET response shape exactly
// (verified against that file directly) — again only the fields rendered
// here (amount_tendered/change_given/customer_name/org_name are part of the
// real response but out of scope for this lookup/audit screen).
interface SaleDetailItem {
  id: string
  product_name: string
  product_strength: string | null
  quantity: number
  unit_price: number
  discount_percent: number
  line_total: number
  base_unit: string | null
}

// Tags the fetched detail (or error) with the sale id it belongs to, so a
// stale response for a previously-selected sale is never rendered against a
// newly-selected one — see the derivation right before the main render below.
interface SaleDetailState {
  saleId: string
  data: SaleDetail | null
  error: string | null
}

interface SaleDetail {
  sale: {
    receipt_number: string | null
    created_at: string
    payment_method: string
    subtotal: number
    discount_amount: number
    tax_amount: number
    total_amount: number
    mpesa_reference: string | null
    cashier_name: string
    branch_name: string | null
    branch_address: string | null
  }
  items: SaleDetailItem[]
}

const PAGE_SIZE = 20
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Devices run exclusively in Kenya (single timezone, no DST — see shifts.tsx/
// dashboard.tsx/reports.tsx), so the device's local clock reads as
// Africa/Nairobi time. Local date fields (not toISOString, which is UTC)
// keep "today"/"this week" pinned to the Nairobi calendar day.
function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function today(): string {
  return toDateStr(new Date())
}

// Mirrors apps/web/app/(dashboard)/sales/page.tsx's weekStart()/today()
// defaults exactly ("this week" -> today), rather than inventing a
// different default range for the mobile screen.
function weekStart(): string {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  return toDateStr(d)
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString([], { day: "2-digit", month: "short" })
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  return `${date}, ${time}`
}

function paymentLabel(method: string): string {
  switch (method) {
    case "mpesa":
      return "M-Pesa"
    case "cash":
      return "Cash"
    case "card":
      return "Card"
    case "split":
      return "Split"
    default:
      return method
  }
}

// API money fields are decimal KES (not cents) — same convention as
// reports.tsx/inventory.tsx/dashboard.tsx — so this rounds to cents before
// handing off to @pharmatrack/core's cents-based formatKES.
function money(v: number): string {
  return formatKES(Math.round(v * 100))
}

export default function Sales() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { branchId } = useSessionStore()

  const [rawSearch, setRawSearch] = useState("")
  const [q, setQ] = useState("")

  // Raw text mirrors what's typed; the applied from/to only updates once the
  // field is empty (open-ended range, mirrors clearing web's <input
  // type=date>) or a fully valid YYYY-MM-DD has been entered — avoids firing
  // a fetch on every keystroke of a partial date the way the debounced
  // search box does for text.
  const [fromInput, setFromInput] = useState(weekStart())
  const [from, setFrom] = useState(weekStart())
  const [toInput, setToInput] = useState(today())
  const [to, setTo] = useState(today())

  const [page, setPage] = useState(1)

  const [data, setData] = useState<SalesResponse | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // Bumped by retry/pull-to-refresh to re-run the effect below without
  // exposing the fetch function itself as a captured effect dependency
  // (mirrors reports.tsx/appointments.tsx's shape, required by this repo's
  // react-hooks/set-state-in-effect rule).
  const [reloadToken, setReloadToken] = useState(0)

  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)
  const [detailState, setDetailState] = useState<SaleDetailState | null>(null)

  // Debounces the search box only (~300ms), per the spec — date changes are
  // applied immediately once a full valid date is typed (see handleFromChange
  // /handleToChange below), no generic debounce hook needed for one screen.
  useEffect(() => {
    const t = setTimeout(() => setQ(rawSearch.trim()), 300)
    return () => clearTimeout(t)
  }, [rawSearch])

  useEffect(() => {
    if (!branchId) return
    const currentBranchId = branchId
    async function load() {
      try {
        const params = new URLSearchParams({
          branch_id: currentBranchId,
          page: String(page),
          limit: String(PAGE_SIZE),
        })
        if (from) params.set("from", from)
        if (to) params.set("to", `${to}T23:59:59`)
        if (q) params.set("q", q)
        const res = await apiFetch(`/api/sales?${params.toString()}`)
        if (!res.ok) {
          setError(`Could not load sales (HTTP ${res.status})`)
          return
        }
        const json = (await res.json()) as SalesResponse
        setData(json)
        setLoaded(true)
        setError(null)
      } catch {
        setError("Could not reach the server. Check your connection and try again.")
      } finally {
        setRefreshing(false)
      }
    }
    load()
  }, [branchId, from, to, q, page, reloadToken])

  // Fetches the tapped sale's detail. Guarded with a `cancelled` flag so a
  // fast tap on a second row doesn't let the first request's late response
  // clobber the second one's. Every setState call here happens after the
  // `await apiFetch(...)` settles (success or throw) rather than
  // synchronously in the effect body, per this repo's
  // react-hooks/set-state-in-effect rule — "loading" isn't tracked as its
  // own state at all, it's derived below from whether detailState's tagged
  // saleId matches the currently selected one (see currentDetailState).
  useEffect(() => {
    if (!selectedSaleId) return
    const saleId = selectedSaleId
    let cancelled = false
    async function loadDetail() {
      try {
        const res = await apiFetch(`/api/sales/${saleId}`)
        if (cancelled) return
        if (!res.ok) {
          // A cashier requesting someone else's sale gets 404 by design
          // (server treats it as not-found rather than 403) — surfaced as-is,
          // no special-casing here.
          setDetailState({
            saleId,
            data: null,
            error: res.status === 404 ? "Sale not found" : `Could not load sale (HTTP ${res.status})`,
          })
          return
        }
        const json = (await res.json()) as SaleDetail
        if (cancelled) return
        setDetailState({ saleId, data: json, error: null })
      } catch {
        if (!cancelled) {
          setDetailState({ saleId, data: null, error: "Could not reach the server. Check your connection and try again." })
        }
      }
    }
    loadDetail()
    return () => {
      cancelled = true
    }
  }, [selectedSaleId])

  function retry() {
    setReloadToken((t) => t + 1)
  }

  function onRefresh() {
    setRefreshing(true)
    setReloadToken((t) => t + 1)
  }

  function handleSearchChange(text: string) {
    setRawSearch(text)
    setPage(1)
  }

  function handleFromChange(text: string) {
    setFromInput(text)
    if (text === "" || DATE_RE.test(text)) {
      setFrom(text)
      setPage(1)
    }
  }

  function handleFromBlur() {
    if (fromInput !== "" && !DATE_RE.test(fromInput)) setFromInput(from)
  }

  function handleToChange(text: string) {
    setToInput(text)
    if (text === "" || DATE_RE.test(text)) {
      setTo(text)
      setPage(1)
    }
  }

  function handleToBlur() {
    if (toInput !== "" && !DATE_RE.test(toInput)) setToInput(to)
  }

  function closeDetail() {
    setSelectedSaleId(null)
  }

  if (error && !loaded) {
    return (
      <Screen>
        <ScreenHeader title="Sales" />
        <View style={styles.centered}>
          <Card style={styles.errorCard}>
            <Text style={styles.error}>{error}</Text>
            <Button
              title="Retry"
              variant="secondary"
              onPress={retry}
              icon={<Ionicons name="refresh-outline" size={18} color={theme.text} />}
            />
          </Card>
        </View>
      </Screen>
    )
  }

  if (!loaded) {
    return (
      <Screen>
        <ScreenHeader title="Sales" />
        <View style={styles.centered}>
          <Text style={styles.label}>Loading…</Text>
        </View>
      </Screen>
    )
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  // Only trust detailState if it's tagged with the currently-selected sale id
  // — otherwise a previous sale's fetched detail/error would flash while the
  // new one is still loading.
  const currentDetailState = detailState && detailState.saleId === selectedSaleId ? detailState : null
  const detail = currentDetailState?.data ?? null
  const detailError = currentDetailState?.error ?? null
  const detailLoading = selectedSaleId != null && currentDetailState == null

  return (
    <Screen>
      <ScreenHeader title="Sales" />
      <FlatList
        data={data?.sales ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.green} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerGap}>
            <Text style={styles.subtitle}>
              {data?.total ?? 0} sale{data?.total === 1 ? "" : "s"} in selected period
            </Text>

            <TextInput
              style={styles.searchInput}
              placeholder="Search receipt number"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="none"
              value={rawSearch}
              onChangeText={handleSearchChange}
            />

            <View style={styles.dateRow}>
              <TextInput
                style={[styles.input, styles.dateInput]}
                placeholder="From (YYYY-MM-DD)"
                placeholderTextColor={theme.textTertiary}
                autoCapitalize="none"
                value={fromInput}
                onChangeText={handleFromChange}
                onBlur={handleFromBlur}
              />
              <TextInput
                style={[styles.input, styles.dateInput]}
                placeholder="To (YYYY-MM-DD)"
                placeholderTextColor={theme.textTertiary}
                autoCapitalize="none"
                value={toInput}
                onChangeText={handleToChange}
                onBlur={handleToBlur}
              />
            </View>

            {error ? <Text style={styles.inlineError}>{error}</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <SaleListRow sale={item} onPress={() => setSelectedSaleId(item.id)} styles={styles} />
        )}
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="receipt-outline" size={28} color={theme.textTertiary} />}
            message="No sales in this range"
          />
        }
        ListFooterComponent={
          data && data.total > PAGE_SIZE ? (
            <View style={styles.paginationRow}>
              <Button
                title="Prev"
                variant="secondary"
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={styles.pageButton}
              />
              <Text style={styles.pageText}>
                Page {page} of {totalPages}
              </Text>
              <Button
                title="Next"
                variant="secondary"
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={styles.pageButton}
              />
            </View>
          ) : null
        }
      />

      <Modal visible={selectedSaleId != null} animationType="slide" transparent onRequestClose={closeDetail}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDetail} />
          <View style={[styles.modalSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeaderRow}>
                <View style={styles.modalNameCol}>
                  <Text style={styles.modalName} numberOfLines={1}>
                    {detail?.sale.receipt_number ?? "Sale details"}
                  </Text>
                  {detail ? <Text style={styles.modalMeta}>{formatDateTime(detail.sale.created_at)}</Text> : null}
                </View>
                <Pressable onPress={closeDetail} hitSlop={12}>
                  <Ionicons name="close" size={24} color={theme.text} />
                </Pressable>
              </View>

              {detailLoading ? <Text style={styles.label}>Loading…</Text> : null}
              {detailError ? <Text style={styles.error}>{detailError}</Text> : null}

              {detail ? (
                <>
                  <Text style={styles.modalSectionLabel}>Details</Text>
                  <DetailRow label="Cashier" value={detail.sale.cashier_name} styles={styles} />
                  <DetailRow label="Branch" value={detail.sale.branch_name ?? "—"} styles={styles} />
                  {detail.sale.branch_address ? (
                    <DetailRow label="Address" value={detail.sale.branch_address} styles={styles} />
                  ) : null}
                  <DetailRow label="Payment" value={paymentLabel(detail.sale.payment_method)} styles={styles} />
                  {detail.sale.mpesa_reference ? (
                    <DetailRow label="M-Pesa ref" value={detail.sale.mpesa_reference} styles={styles} />
                  ) : null}

                  <Text style={styles.modalSectionLabel}>Items</Text>
                  {detail.items.map((item, i) => (
                    <SaleItemRow key={item.id} item={item} isFirst={i === 0} styles={styles} />
                  ))}

                  <View style={styles.totalsBlock}>
                    <View style={styles.totalsRow}>
                      <Text style={styles.totalsKey}>Subtotal</Text>
                      <Text style={styles.totalsValue}>{money(detail.sale.subtotal)}</Text>
                    </View>
                    {detail.sale.discount_amount > 0 ? (
                      <View style={styles.totalsRow}>
                        <Text style={styles.totalsKey}>Discount</Text>
                        <Text style={[styles.totalsValue, { color: theme.amber }]}>
                          -{money(detail.sale.discount_amount)}
                        </Text>
                      </View>
                    ) : null}
                    {detail.sale.tax_amount > 0 ? (
                      <View style={styles.totalsRow}>
                        <Text style={styles.totalsKey}>Tax</Text>
                        <Text style={styles.totalsValue}>{money(detail.sale.tax_amount)}</Text>
                      </View>
                    ) : null}
                    <View style={styles.totalsRow}>
                      <Text style={styles.totalsKeyBold}>Total</Text>
                      <Text style={styles.totalsValueBold}>{money(detail.sale.total_amount)}</Text>
                    </View>
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  )
}

function SaleListRow({ sale, onPress, styles }: { sale: SaleRow; onPress: () => void; styles: Styles }) {
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.saleCard}>
        <View style={styles.saleHeaderRow}>
          <View style={styles.saleLeftCol}>
            <Text style={styles.saleReceipt} numberOfLines={1}>
              {sale.receipt_number}
            </Text>
            <Text style={styles.saleMeta} numberOfLines={1}>
              {formatDateTime(sale.created_at)} · {sale.cashier_name}
            </Text>
          </View>
          <StatusBadge status="neutral" label={paymentLabel(sale.payment_method)} />
        </View>
        <View style={styles.saleFooterRow}>
          <Text style={styles.saleItems}>
            {sale.item_count} item{sale.item_count === 1 ? "" : "s"}
          </Text>
          <Text style={styles.saleTotal}>{money(sale.total_amount)}</Text>
        </View>
      </Card>
    </Pressable>
  )
}

function DetailRow({ label, value, styles }: { label: string; value: string; styles: Styles }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailKey}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

function SaleItemRow({ item, isFirst, styles }: { item: SaleDetailItem; isFirst: boolean; styles: Styles }) {
  const meta = `${item.quantity} ${item.base_unit ?? "units"} × ${money(item.unit_price)}${
    item.discount_percent > 0 ? ` · -${item.discount_percent}%` : ""
  }`
  return (
    <View style={[styles.itemRow, !isFirst && styles.rowBorder]}>
      <View style={styles.itemLeftCol}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.product_name}
          {item.product_strength ? ` (${item.product_strength})` : ""}
        </Text>
        <Text style={styles.itemMeta}>{meta}</Text>
      </View>
      <Text style={styles.itemTotal}>{money(item.line_total)}</Text>
    </View>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
    label: { fontSize: 15, color: theme.text },
    error: { color: theme.red, fontSize: 13 },
    errorCard: { gap: 8, alignItems: "center" },
    inlineError: { color: theme.red, fontSize: 13 },

    listContent: { paddingBottom: 24 },
    headerGap: { gap: 10, marginBottom: 4 },
    subtitle: { fontSize: 13, color: theme.textSecondary },

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
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontSize: 15,
      backgroundColor: theme.surface,
      color: theme.text,
    },
    dateRow: { flexDirection: "row", gap: 8 },
    dateInput: { flex: 1 },

    rowGap: { height: 8 },
    saleCard: { gap: 8 },
    saleHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
    saleLeftCol: { flex: 1, gap: 2 },
    saleReceipt: { fontSize: 15, fontWeight: "600", color: theme.text },
    saleMeta: { fontSize: 12, color: theme.textSecondary },
    saleFooterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
    saleItems: { fontSize: 13, color: theme.textSecondary },
    saleTotal: { fontSize: 15, fontWeight: "700", color: theme.text },

    paginationRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginTop: 12,
    },
    pageButton: { flex: 1 },
    pageText: { fontSize: 13, fontWeight: "600", color: theme.text },

    modalRoot: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    modalSheet: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderWidth: 1,
      borderBottomWidth: 0,
      padding: 16,
      maxHeight: "85%",
      gap: 10,
    },
    modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
    modalNameCol: { flex: 1, gap: 2 },
    modalName: { fontSize: 17, fontWeight: "700", color: theme.text },
    modalMeta: { fontSize: 13, color: theme.textSecondary },
    modalSectionLabel: { fontSize: 12, fontWeight: "600", color: theme.textSecondary, marginTop: 12 },

    detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 4 },
    detailKey: { fontSize: 13, color: theme.textSecondary },
    detailValue: { flex: 1, textAlign: "right", fontSize: 13, color: theme.text, fontWeight: "600" },

    itemRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 8 },
    rowBorder: { borderTopWidth: 1, borderTopColor: theme.border },
    itemLeftCol: { flex: 1, gap: 2 },
    itemName: { fontSize: 14, fontWeight: "600", color: theme.text },
    itemMeta: { fontSize: 12, color: theme.textSecondary },
    itemTotal: { fontSize: 14, fontWeight: "600", color: theme.text },

    totalsBlock: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border, gap: 4 },
    totalsRow: { flexDirection: "row", justifyContent: "space-between" },
    totalsKey: { fontSize: 13, color: theme.textSecondary },
    totalsValue: { fontSize: 13, color: theme.text },
    totalsKeyBold: { fontSize: 15, fontWeight: "700", color: theme.text },
    totalsValueBold: { fontSize: 15, fontWeight: "700", color: theme.text },
  })
}

type Styles = ReturnType<typeof createStyles>
