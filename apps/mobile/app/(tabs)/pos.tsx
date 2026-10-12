import { useCallback, useEffect, useState } from "react"
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES, fromCents, type BarcodeScanEvent } from "@pharmatrack/core"
import type { ProductRow } from "../../src/db/schema"
import { findByBarcode, searchLocalProducts } from "../../src/lib/sync/catalogue"
import { env } from "../../src/lib/env"
import { AllowanceError, commitDeviceSale, sellableFor } from "../../src/lib/sync/commit-sale"
import { refreshSyncState, requestTopUp, scheduleSoonSync } from "../../src/lib/sync/engine"
import type { PaymentInput } from "../../src/lib/sync/core/payload"
import { useSyncStore } from "../../src/store/sync"
import { useStaffStore } from "../../src/store/staff"
import type { CartItem } from "../../src/store/cart"
import { commitLocalSale } from "../../src/repo/sales"
import { getCurrentStaffId } from "../../src/lib/local-auth"
import { fetchMpesaAvailability, type MpesaAvailability } from "../../src/lib/mpesa"
import { useSessionStore } from "../../src/store/session"
import { useShiftStore } from "../../src/store/shift"
import { useCartStore } from "../../src/store/cart"
import { confirmSignOut } from "../../src/lib/auth-client"
import { toast } from "../../src/lib/toast"
import { useTheme } from "../../src/theme/useTheme"
import type { Theme } from "../../src/theme/tokens"
import {
  Button, Card, DeviceGate, EmptyState, HardwareScanCatcher, MpesaFlow, Screen, SellingLock, StatusBadge, SyncBanners, SyncStatusBar,
} from "../../src/components"

// "till" = M-Pesa paid to the shop's till/paybill and keyed in by hand —
// works offline, uploaded with mpesa_verified=false for the owner to check.
type PaymentMethod = "cash" | "mpesa" | "till" | "split"

const MPESA_CODE_RE = /^[A-Z0-9]{10}$/i
const OFFLINE_EDITION = env.EXPO_PUBLIC_OFFLINE_MODE

const toLines = (items: CartItem[]) =>
  items.map((i) => ({
    productId: i.productId,
    productName: i.productName,
    productStrength: i.productStrength,
    baseUnit: i.baseUnit,
    quantity: i.quantity,
    unitPriceCents: i.unitPrice,
    discountPercent: i.discountPercent,
    isControlled: i.isControlled,
  }))

export default function Pos() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { branchId, loadMe, loaded, error: sessionError } = useSessionStore()
  const { activeShift, loadActiveShift } = useShiftStore()
  // R1: the app-wide sync engine (mounted in the root layout) replaced the
  // per-screen useSyncEngine hook; this screen only reads its state.
  const { online: isOnline, lastSyncAt, device, status: syncStatus, lock } = useSyncStore()
  const currentStaff = useStaffStore((s) => s.current)
  const { items, addProduct, incrementQty, clear, subtotal, discountTotal, total, setDiscountPercent, maxAllowedDiscountPercent, setStockLimit } =
    useCartStore()

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ProductRow[]>([])
  const [tendered, setTendered] = useState("")
  const [receipt, setReceipt] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [tillCode, setTillCode] = useState("")
  const [committing, setCommitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [discountInput, setDiscountInput] = useState("")

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [mpesaAvailability, setMpesaAvailability] = useState<MpesaAvailability | null>(null)
  const [splitCash, setSplitCash] = useState("")
  const [splitMpesa, setSplitMpesa] = useState("")

  useEffect(() => {
    loadMe()
  }, [loadMe])

  // The shift gate follows whoever is selling (local shifts, R1 rule 5).
  useEffect(() => {
    loadActiveShift()
  }, [loadActiveShift, currentStaff?.id])

  // Online build: what the till may sell = min(this phone's allowance, cached
  // stock) — shown in the list and used as each cart line's cap (R1 rule 2).
  const withSellable = useCallback((rows: ProductRow[]): ProductRow[] => {
    if (OFFLINE_EDITION) return rows
    const active = rows.filter((p) => p.isActive)
    const sellable = sellableFor(active.map((p) => p.productId))
    return active.map((p) => ({ ...p, stockOnHand: sellable.get(p.productId) ?? 0 }))
  }, [])

  useEffect(() => {
    searchLocalProducts(query).then((rows) => setResults(withSellable(rows)))
  }, [query, lastSyncAt, refreshKey, withSellable])

  // Fetched once on screen load, not re-fetched on every render — mirrors the
  // web POS's mpesaAvailable query (apps/web/app/(pos)/pos/page.tsx), just
  // without the react-query staleTime plumbing.
  useEffect(() => {
    fetchMpesaAvailability().then(setMpesaAvailability)
  }, [])

  // M-Pesa/Split are only offered when the tenant's plan+config allow STK push
  // at all (mirrors web's stkAvailable gating) — while this is still loading
  // the selector stays hidden, same as "not available".
  const mpesaOffered = mpesaAvailability?.available ?? false

  const splitCashCents = splitCash.trim() === "" ? null : Math.round(Number(splitCash) * 100)
  const splitMpesaCents = splitMpesa.trim() === "" ? null : Math.round(Number(splitMpesa) * 100)
  const splitNumbersValid =
    splitCashCents != null && splitMpesaCents != null && !Number.isNaN(splitCashCents) && !Number.isNaN(splitMpesaCents)
  // "within 1 cent" per spec — the server never re-validates this sum, so the
  // client must enforce it before allowing confirm.
  const splitBalanced = splitNumbersValid && Math.abs(splitCashCents + splitMpesaCents - total()) <= 1
  const splitBothPositive = splitNumbersValid && splitCashCents > 0 && splitMpesaCents > 0
  const splitReady = splitBalanced && splitBothPositive

  // Most restrictive product discount cap across current cart items — mirrors
  // web's CartPanel.tsx maxAllowedDiscount. The store already clamps every
  // line to its own cap when setDiscountPercent() runs; this is purely for
  // the "(max X%)" label and the "we capped it" notice below.
  const maxDiscountPct = maxAllowedDiscountPercent()
  const requestedDiscountPct = discountInput.trim() === "" ? 0 : Number(discountInput)
  const discountExceedsCap =
    maxDiscountPct !== null && !Number.isNaN(requestedDiscountPct) && requestedDiscountPct > maxDiscountPct

  async function onHardwareScan(event: BarcodeScanEvent) {
    const code = event.gtin ?? event.raw
    const product = await findByBarcode(code)
    if (!product || (!OFFLINE_EDITION && !product.isActive)) {
      toast.error(`No product found for "${code}"`)
      return
    }
    const [row] = withSellable([product])
    if (row && (await addSellable(row))) toast.success(product.name)
  }

  // Ask the server for more of this product when the phone's allowance runs
  // out mid-sale (online only). Returns the new sellable quantity.
  async function topUp(productId: string, wanted: number): Promise<number | null> {
    if (OFFLINE_EDITION || !isOnline) return null
    const granted = await requestTopUp(productId, wanted)
    if (granted <= 0) return null
    const next = sellableFor([productId]).get(productId) ?? 0
    setStockLimit(productId, next)
    setRefreshKey((k) => k + 1)
    return next
  }

  async function addSellable(product: ProductRow): Promise<boolean> {
    const inCart = items.find((i) => i.productId === product.productId)?.quantity ?? 0
    let limit = product.stockOnHand
    if (inCart + 1 > limit) {
      const next = await topUp(product.productId, inCart + 1 - limit)
      if (next != null) limit = next
    }
    if (inCart + 1 > limit) {
      addProduct({ ...product, stockOnHand: limit }) // shows the "Only N left" toast
      return false
    }
    addProduct({ ...product, stockOnHand: limit })
    return true
  }

  async function onIncrement(item: CartItem) {
    if (item.quantity + 1 > item.stockOnHand) await topUp(item.productId, item.quantity + 1 - item.stockOnHand)
    incrementQty(item.productId, 1)
  }

  function finishSale(receiptNumber: string) {
    setReceipt(receiptNumber)
    clear()
    setTendered("")
    setDiscountInput("")
    setTillCode("")
    setSplitCash("")
    setSplitMpesa("")
    setPaymentMethod("cash")
    setRefreshKey((k) => k + 1)
  }

  // R1 rules 2 + 7: the one commit path for the online build — allowance
  // check, receipt number, stock/allowance decrement and outbox row in a
  // single SQLite transaction. Retries once after a top-up when online.
  async function commitOnline(payment: PaymentInput): Promise<void> {
    setCheckoutError(null)
    if (!device || !currentStaff || !activeShift) {
      setCheckoutError("Clock in before taking sales")
      return
    }
    // The deadline may have passed while the cart was open.
    refreshSyncState()
    const live = useSyncStore.getState()
    if (live.lock.locked) {
      setCheckoutError("Selling is locked — sync first")
      return
    }
    setCommitting(true)
    try {
      const attempt = () =>
        commitDeviceSale({
          deviceCode: device.code,
          cashierId: currentStaff.id,
          shiftClientId: activeShift.id,
          lines: toLines(useCartStore.getState().items),
          payment,
          overrideClientId: live.lock.underOverride && live.override ? live.override.client_id : null,
        })
      let result
      try {
        result = attempt()
      } catch (err) {
        if (!(err instanceof AllowanceError)) throw err
        const line = useCartStore.getState().items.find((i) => i.productId === err.productId)
        const next = line ? await topUp(err.productId, line.quantity - err.available) : null
        if (next == null || !line || next < line.quantity) {
          setStockLimit(err.productId, err.available)
          throw err
        }
        result = attempt()
      }
      finishSale(result.receiptNumber)
      refreshSyncState()
      scheduleSoonSync()
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : String(err))
    } finally {
      setCommitting(false)
    }
  }

  function onDiscountChange(text: string) {
    setDiscountInput(text)
    const pct = text.trim() === "" ? 0 : Number(text)
    if (!Number.isNaN(pct)) setDiscountPercent(pct)
  }

  function splitEvenly() {
    const totalC = total()
    const half = Math.floor(totalC / 2)
    setSplitCash(fromCents(half))
    setSplitMpesa(fromCents(totalC - half))
  }

  async function onCheckout() {
    setCheckoutError(null)
    if (!activeShift) {
      setCheckoutError("Clock in before taking sales")
      return
    }
    const tenderedAmount = Number(tendered)
    if ((OFFLINE_EDITION && !branchId) || items.length === 0 || !tenderedAmount || tenderedAmount * 100 < total()) {
      setCheckoutError("Enter a tendered amount covering the total")
      return
    }
    if (OFFLINE_EDITION && branchId) {
      const cashierId = (await getCurrentStaffId()) ?? "unknown"
      const amountTenderedCents = Math.round(tenderedAmount * 100)
      const { receiptNumber } = await commitLocalSale({
        branchId, shiftId: activeShift.id, cashierId, items,
        paymentMethod: "cash", amountTenderedCents, changeGivenCents: amountTenderedCents - total(),
      })
      setReceipt(receiptNumber)
      clear()
      setTendered("")
      setDiscountInput("")
      return
    }
    await commitOnline({ method: "cash", tenderedCents: Math.round(tenderedAmount * 100) })
  }

  async function onMpesaConfirmed(reference: string | null) {
    if (items.length === 0) return
    await commitOnline({ method: "mpesa", reference, verified: true })
  }

  async function onTillConfirmed() {
    const code = tillCode.trim().toUpperCase()
    if (code && !MPESA_CODE_RE.test(code)) {
      setCheckoutError("M-Pesa codes are 10 letters/numbers — or leave it blank")
      return
    }
    if (items.length === 0) return
    await commitOnline({ method: "mpesa", reference: code || null, verified: false })
  }

  async function onSplitConfirmed(reference: string | null) {
    if (items.length === 0 || splitCashCents == null || splitMpesaCents == null) return
    await commitOnline({ method: "split", cashCents: splitCashCents, mpesaCents: splitMpesaCents, reference, verified: true })
  }

  if (receipt) {
    return (
      <Screen style={styles.receiptContainer}>
        <Ionicons name="checkmark-circle-outline" size={56} color={theme.green} />
        <Text style={styles.title}>Sale recorded</Text>
        <Text style={styles.receiptText}>Receipt: {receipt}</Text>
        {OFFLINE_EDITION ? null : (
          <Text style={styles.receiptText}>
            {isOnline ? "Saved on this phone — uploading…" : "Saved on this phone — will upload when back online"}
          </Text>
        )}
        <Button title="New sale" onPress={() => setReceipt(null)} style={styles.newSaleButton} />
      </Screen>
    )
  }

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        {OFFLINE_EDITION ? <StatusBadge status="ok" label="Offline edition" /> : <SyncStatusBar />}
        <View style={styles.headerActions}>
          {OFFLINE_EDITION ? null : (
            <Pressable onPress={() => router.push("/switch-user")} style={styles.iconButton} hitSlop={8} accessibilityLabel="Switch user">
              <Ionicons name="people-outline" size={22} color={theme.text} />
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push("/scan")}
            style={styles.iconButton}
            accessibilityLabel="Scan barcode"
          >
            <Ionicons name="barcode-outline" size={22} color={theme.text} />
          </Pressable>
          <Pressable onPress={confirmSignOut} style={styles.iconButton} accessibilityLabel="Sign out">
            <Ionicons name="log-out-outline" size={22} color={theme.text} />
          </Pressable>
        </View>
      </View>

      {OFFLINE_EDITION ? null : <SyncBanners />}

      {/* R1 gates (online build): registered phone → selling not locked →
          someone chosen to sell → (below) an open local shift. */}
      {!OFFLINE_EDITION && (!device || syncStatus === "revoked") ? (
        <DeviceGate />
      ) : !OFFLINE_EDITION && lock.locked ? (
        <SellingLock />
      ) : !OFFLINE_EDITION && !currentStaff ? (
        <Card style={styles.errorCard}>
          <Text style={styles.receiptText}>Choose who is selling on this phone</Text>
          <Button
            title="Choose staff"
            onPress={() => router.push("/switch-user")}
            icon={<Ionicons name="people-outline" size={18} color="#fff" />}
          />
        </Card>
      ) : !loaded ? (
        sessionError ? (
          <Card style={styles.errorCard}>
            <Text style={styles.error}>{sessionError}</Text>
            <Button
              title="Retry"
              variant="secondary"
              onPress={() => loadMe()}
              icon={<Ionicons name="refresh-outline" size={18} color={theme.text} />}
            />
          </Card>
        ) : (
          <Text style={styles.receiptText}>Loading…</Text>
        )
      ) : (
        <>
          <HardwareScanCatcher onScan={onHardwareScan} />
          {/* branchId (and the active shift) can come from the offline cache
              (kv.ts) when the network is down — the catalogue is local SQLite
              regardless, so the sale flow below still works. This banner is
              informational only; it must never block the UI beneath it. */}
          {sessionError && OFFLINE_EDITION ? (
            <Card style={styles.offlineNoticeCard}>
              <Text style={styles.offlineNoticeText}>{sessionError}</Text>
            </Card>
          ) : null}
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={18} color={theme.textTertiary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search products"
              placeholderTextColor={theme.textTertiary}
              value={query}
              onChangeText={setQuery}
            />
          </View>
          <FlatList
            data={results}
            keyExtractor={(p) => p.productId}
            style={styles.productList}
            renderItem={({ item }) => (
              <Pressable onPress={() => void addSellable(item)} style={styles.productPress}>
                <Card style={styles.productCard}>
                  <View style={styles.productRow}>
                    <View style={styles.productInfo}>
                      <Text style={styles.productName}>
                        {item.name}
                        {item.strength ? ` (${item.strength})` : ""}
                      </Text>
                      <Text style={item.stockOnHand > 0 ? styles.stockText : styles.stockTextEmpty}>
                        {OFFLINE_EDITION
                          ? item.stockOnHand > 0 ? `${item.stockOnHand} in stock` : "Out of stock"
                          : item.stockOnHand > 0 ? `${item.stockOnHand} available on this phone` : "None left on this phone"}
                      </Text>
                    </View>
                    <Text style={styles.priceText}>{formatKES(Math.round(item.sellingPrice * 100))}</Text>
                  </View>
                </Card>
              </Pressable>
            )}
            ListEmptyComponent={
              <EmptyState
                icon={<Ionicons name="search-outline" size={32} color={theme.textTertiary} />}
                message={query ? "No products match your search" : "Start typing to search products"}
              />
            }
          />

          <Text style={styles.title}>Cart</Text>
          <FlatList
            data={items}
            keyExtractor={(i) => i.productId}
            style={styles.cartList}
            renderItem={({ item }) => (
              <Card style={styles.cartCard}>
                <View style={styles.cartRow}>
                  <Text style={styles.cartItemName}>{item.productName}</Text>
                  <Pressable onPress={() => incrementQty(item.productId, -1)} hitSlop={12} style={styles.qtyPress}>
                    <Text style={styles.qtyButton}>−</Text>
                  </Pressable>
                  <Text style={styles.qty}>{item.quantity}</Text>
                  <Pressable onPress={() => void onIncrement(item)} hitSlop={12} style={styles.qtyPress}>
                    <Text style={styles.qtyButton}>+</Text>
                  </Pressable>
                </View>
              </Card>
            )}
            ListEmptyComponent={
              <EmptyState icon={<Ionicons name="cart-outline" size={32} color={theme.textTertiary} />} message="Cart is empty" />
            }
          />

          {items.length > 0 ? (
            <Card style={styles.discountCard}>
              <Text style={styles.discountLabel}>
                Discount % {maxDiscountPct !== null ? `(max ${maxDiscountPct}%)` : ""}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={theme.textTertiary}
                keyboardType="decimal-pad"
                value={discountInput}
                onChangeText={onDiscountChange}
              />
              {discountExceedsCap ? (
                <Text style={styles.discountWarning}>
                  Discount capped at {maxDiscountPct}% for one or more items
                </Text>
              ) : null}
            </Card>
          ) : null}

          <Card style={styles.totalsCard}>
            <Text style={styles.totalText}>Subtotal: {formatKES(subtotal())}</Text>
            <Text style={styles.totalText}>Discount: {formatKES(discountTotal())}</Text>
            <Text style={styles.totalText}>Total: {formatKES(total())}</Text>
          </Card>

          {!activeShift ? (
            <Card style={styles.errorCard}>
              <Text style={styles.receiptText}>Clock in before taking sales</Text>
              <Button
                title="Go to Shifts"
                onPress={() => router.push("/shifts")}
                icon={<Ionicons name="time-outline" size={18} color="#fff" />}
              />
            </Card>
          ) : (
            <>
              {mpesaOffered || !OFFLINE_EDITION ? (
                <>
                  <View style={styles.methodRow}>
                    <Button
                      title="Cash"
                      variant={paymentMethod === "cash" ? "primary" : "secondary"}
                      onPress={() => setPaymentMethod("cash")}
                      style={styles.methodButton}
                    />
                    {mpesaOffered ? (
                      <Button
                        title="M-Pesa"
                        variant={paymentMethod === "mpesa" ? "primary" : "secondary"}
                        onPress={() => setPaymentMethod("mpesa")}
                        disabled={!isOnline}
                        style={styles.methodButton}
                      />
                    ) : null}
                    {OFFLINE_EDITION ? null : (
                      <Button
                        title="Till/Paybill"
                        variant={paymentMethod === "till" ? "primary" : "secondary"}
                        onPress={() => setPaymentMethod("till")}
                        style={styles.methodButton}
                      />
                    )}
                    {mpesaOffered ? (
                      <Button
                        title="Split"
                        variant={paymentMethod === "split" ? "primary" : "secondary"}
                        onPress={() => setPaymentMethod("split")}
                        disabled={!isOnline}
                        style={styles.methodButton}
                      />
                    ) : null}
                  </View>
                  {!isOnline && mpesaOffered ? (
                    <Text style={styles.offlineNoticeText}>
                      M-Pesa prompts and Split need internet — use Till/Paybill for M-Pesa paid to the shop
                    </Text>
                  ) : null}
                </>
              ) : null}

              {paymentMethod === "cash" ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Cash tendered (KES)"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="decimal-pad"
                    value={tendered}
                    onChangeText={setTendered}
                  />
                  {checkoutError ? <Text style={styles.error}>{checkoutError}</Text> : null}
                  <Button
                    title="Complete cash sale"
                    onPress={onCheckout}
                    loading={committing}
                    disabled={items.length === 0}
                    icon={<Ionicons name="checkmark-circle-outline" size={18} color="#fff" />}
                  />
                </>
              ) : null}

              {paymentMethod === "till" && !OFFLINE_EDITION ? (
                <Card style={styles.discountCard}>
                  <Text style={styles.discountLabel}>M-Pesa paid to the shop&apos;s till/paybill · {formatKES(total())}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="M-Pesa code (optional)"
                    placeholderTextColor={theme.textTertiary}
                    autoCapitalize="characters"
                    maxLength={10}
                    value={tillCode}
                    onChangeText={(v) => setTillCode(v.toUpperCase().slice(0, 10))}
                  />
                  <Text style={styles.stockText}>Check the customer&apos;s M-Pesa message first. The owner verifies these later.</Text>
                  {checkoutError ? <Text style={styles.error}>{checkoutError}</Text> : null}
                  <Button
                    title="Record M-Pesa payment"
                    onPress={onTillConfirmed}
                    loading={committing}
                    disabled={items.length === 0}
                    icon={<Ionicons name="checkmark-circle-outline" size={18} color="#fff" />}
                  />
                </Card>
              ) : null}

              {/* isOnline only gates which methods are SELECTABLE (above) — once
                  a flow is already active we don't tear it down on a mid-flow
                  disconnect. "Confirm received" and "Enter code manually"
                  need no network at all, and a failed Send/Resend surfaces its
                  own error from sendStkPush()'s network catch. */}
              {paymentMethod === "mpesa" && mpesaOffered ? (
                <>
                  <MpesaFlow amountCents={total()} onConfirmed={onMpesaConfirmed} />
                  {checkoutError ? <Text style={styles.error}>{checkoutError}</Text> : null}
                </>
              ) : null}

              {paymentMethod === "split" && mpesaOffered ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Cash portion (KES)"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="decimal-pad"
                    value={splitCash}
                    onChangeText={setSplitCash}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="M-Pesa portion (KES)"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="decimal-pad"
                    value={splitMpesa}
                    onChangeText={setSplitMpesa}
                  />
                  <Button title="Split evenly" variant="secondary" onPress={splitEvenly} />
                  {splitNumbersValid && !splitBalanced ? (
                    <Text style={styles.error}>Cash + M-Pesa must add up to {formatKES(total())}</Text>
                  ) : null}
                  {splitBalanced && !splitBothPositive ? (
                    <Text style={styles.error}>Enter both a cash amount and an M-Pesa amount</Text>
                  ) : null}
                  {splitReady && splitMpesaCents != null ? (
                    <MpesaFlow amountCents={splitMpesaCents} onConfirmed={onSplitConfirmed} />
                  ) : null}
                  {checkoutError ? <Text style={styles.error}>{checkoutError}</Text> : null}
                </>
              ) : null}
            </>
          )}
        </>
      )}
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { gap: 8 },
    receiptContainer: { alignItems: "center", justifyContent: "center", gap: 8 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 },
    headerActions: { flexDirection: "row", gap: 4 },
    iconButton: { padding: 8, borderRadius: 8 },
    title: { fontSize: 18, fontWeight: "700", marginTop: 8, color: theme.text },
    searchRow: { position: "relative", justifyContent: "center" },
    searchIcon: { position: "absolute", left: 12, zIndex: 1 },
    searchInput: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingVertical: 10,
      paddingLeft: 36,
      paddingRight: 10,
      fontSize: 15,
      backgroundColor: theme.surface,
      color: theme.text,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      padding: 10,
      fontSize: 15,
      backgroundColor: theme.surface,
      color: theme.text,
    },
    productList: { maxHeight: 260 },
    productCard: { marginBottom: 8, paddingVertical: 10 },
    productRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    productInfo: { flex: 1, gap: 2 },
    productName: { color: theme.text },
    stockText: { fontSize: 12, color: theme.textSecondary },
    stockTextEmpty: { fontSize: 12, color: theme.red },
    priceText: { color: theme.text },
    cartList: { maxHeight: 200 },
    cartCard: { marginBottom: 8, paddingVertical: 8 },
    cartRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    cartItemName: { flex: 1, color: theme.text },
    qtyButton: { fontSize: 20, paddingHorizontal: 10, color: theme.text },
    qtyPress: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
    productPress: { minHeight: 48 },
    qty: { width: 24, textAlign: "center", color: theme.text },
    totalsCard: { gap: 4 },
    discountCard: { gap: 6 },
    discountLabel: { fontSize: 13, fontWeight: "600", color: theme.textSecondary },
    discountWarning: { color: theme.amber, fontSize: 13 },
    errorCard: { gap: 8 },
    methodRow: { flexDirection: "row", gap: 8 },
    methodButton: { flex: 1, paddingVertical: 10, paddingHorizontal: 8 },
    offlineNoticeCard: { paddingVertical: 8, borderColor: theme.amber, borderWidth: 1 },
    offlineNoticeText: { color: theme.amber, fontSize: 13 },
    totalText: { fontSize: 16, fontWeight: "600", color: theme.text },
    newSaleButton: { marginTop: 16, minWidth: 160 },
    error: { color: theme.red },
    receiptText: { fontSize: 16, textAlign: "center", marginTop: 8, color: theme.text },
  })
}
