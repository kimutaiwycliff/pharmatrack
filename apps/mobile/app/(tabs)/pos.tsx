import { useEffect, useState } from "react"
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES, fromCents, type BarcodeScanEvent } from "@pharmatrack/core"
import type { ProductRow } from "../../src/db/schema"
import { findByBarcode, searchLocalProducts } from "../../src/lib/sync/catalogue"
import { buildSalePayload, queueSale } from "../../src/lib/sync/sales"
import { useSyncEngine } from "../../src/lib/sync/useSyncEngine"
import { env } from "../../src/lib/env"
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
import { Button, Card, EmptyState, HardwareScanCatcher, MpesaFlow, Screen, StatusBadge } from "../../src/components"

type PaymentMethod = "cash" | "mpesa" | "split"

function randomUUID(): string {
  // crypto.randomUUID isn't available in the Hermes runtime; RFC4122-ish v4.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export default function Pos() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { branchId, loadMe, loaded, error: sessionError } = useSessionStore()
  const { activeShift, loadActiveShift } = useShiftStore()
  const { isOnline, lastSyncedAt } = useSyncEngine(branchId)
  const { items, addProduct, incrementQty, clear, subtotal, discountTotal, total, setDiscountPercent, maxAllowedDiscountPercent } =
    useCartStore()

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ProductRow[]>([])
  const [tendered, setTendered] = useState("")
  const [receipt, setReceipt] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [discountInput, setDiscountInput] = useState("")

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [mpesaAvailability, setMpesaAvailability] = useState<MpesaAvailability | null>(null)
  const [splitCash, setSplitCash] = useState("")
  const [splitMpesa, setSplitMpesa] = useState("")

  useEffect(() => {
    loadMe()
    loadActiveShift()
  }, [loadMe, loadActiveShift])

  useEffect(() => {
    searchLocalProducts(query).then(setResults)
  }, [query, lastSyncedAt])

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
    if (!product) {
      toast.error(`No product found for "${code}"`)
      return
    }
    addProduct(product)
    toast.success(product.name)
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
    if (!branchId || items.length === 0 || !tenderedAmount || tenderedAmount * 100 < total()) {
      setCheckoutError("Enter a tendered amount covering the total")
      return
    }
    if (env.EXPO_PUBLIC_OFFLINE_MODE) {
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
    const offlineReference = randomUUID()
    const payload = buildSalePayload({
      paymentMethod: "cash",
      branchId,
      shiftId: activeShift.id,
      items,
      totalCents: total(),
      offlineReference,
      amountTenderedCents: Math.round(tenderedAmount * 100),
    })
    await queueSale(payload)
    setReceipt(offlineReference)
    clear()
    setTendered("")
    setDiscountInput("")
  }

  async function onMpesaConfirmed(reference: string | null) {
    if (!branchId || !activeShift || items.length === 0) return
    const offlineReference = randomUUID()
    const payload = buildSalePayload({
      paymentMethod: "mpesa",
      branchId,
      shiftId: activeShift.id,
      items,
      totalCents: total(),
      offlineReference,
      mpesaReference: reference,
    })
    await queueSale(payload)
    setReceipt(offlineReference)
    clear()
    setDiscountInput("")
    setPaymentMethod("cash")
  }

  async function onSplitConfirmed(reference: string | null) {
    if (!branchId || !activeShift || items.length === 0 || splitCashCents == null || splitMpesaCents == null) return
    const offlineReference = randomUUID()
    const payload = buildSalePayload({
      paymentMethod: "split",
      branchId,
      shiftId: activeShift.id,
      items,
      totalCents: total(),
      offlineReference,
      cashAmountCents: splitCashCents,
      mpesaAmountCents: splitMpesaCents,
      mpesaReference: reference,
    })
    await queueSale(payload)
    setReceipt(offlineReference)
    clear()
    setSplitCash("")
    setSplitMpesa("")
    setDiscountInput("")
    setPaymentMethod("cash")
  }

  if (receipt) {
    return (
      <Screen style={styles.receiptContainer}>
        <Ionicons name="checkmark-circle-outline" size={56} color={theme.green} />
        <Text style={styles.title}>Sale recorded</Text>
        <Text style={styles.receiptText}>Reference: {receipt}</Text>
        <Text style={styles.receiptText}>{isOnline ? "Syncing to server…" : "Queued — will sync once back online"}</Text>
        <Button title="New sale" onPress={() => setReceipt(null)} style={styles.newSaleButton} />
      </Screen>
    )
  }

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <StatusBadge
          status={isOnline ? "ok" : "warning"}
          label={isOnline ? "Online" : "Offline — sales will queue"}
        />
        <View style={styles.headerActions}>
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

      {!loaded ? (
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
          {sessionError ? (
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
              <Pressable onPress={() => addProduct(item)}>
                <Card style={styles.productCard}>
                  <View style={styles.productRow}>
                    <View style={styles.productInfo}>
                      <Text style={styles.productName}>
                        {item.name}
                        {item.strength ? ` (${item.strength})` : ""}
                      </Text>
                      <Text style={item.stockOnHand > 0 ? styles.stockText : styles.stockTextEmpty}>
                        {item.stockOnHand > 0 ? `${item.stockOnHand} in stock` : "Out of stock"}
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
                  <Pressable onPress={() => incrementQty(item.productId, -1)} hitSlop={8}>
                    <Text style={styles.qtyButton}>−</Text>
                  </Pressable>
                  <Text style={styles.qty}>{item.quantity}</Text>
                  <Pressable onPress={() => incrementQty(item.productId, 1)} hitSlop={8}>
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
              {mpesaOffered ? (
                <>
                  <View style={styles.methodRow}>
                    <Button
                      title="Cash"
                      variant={paymentMethod === "cash" ? "primary" : "secondary"}
                      onPress={() => setPaymentMethod("cash")}
                      style={styles.methodButton}
                    />
                    <Button
                      title="M-Pesa"
                      variant={paymentMethod === "mpesa" ? "primary" : "secondary"}
                      onPress={() => setPaymentMethod("mpesa")}
                      disabled={!isOnline}
                      style={styles.methodButton}
                    />
                    <Button
                      title="Split"
                      variant={paymentMethod === "split" ? "primary" : "secondary"}
                      onPress={() => setPaymentMethod("split")}
                      disabled={!isOnline}
                      style={styles.methodButton}
                    />
                  </View>
                  {!isOnline ? (
                    <Text style={styles.offlineNoticeText}>M-Pesa and Split require an internet connection</Text>
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
                    disabled={items.length === 0}
                    icon={<Ionicons name="checkmark-circle-outline" size={18} color="#fff" />}
                  />
                </>
              ) : null}

              {/* isOnline only gates which methods are SELECTABLE (above) — once
                  a flow is already active we don't tear it down on a mid-flow
                  disconnect. "Confirm received" and "Enter code manually"
                  need no network at all, and a failed Send/Resend surfaces its
                  own error from sendStkPush()'s network catch. */}
              {paymentMethod === "mpesa" && mpesaOffered ? (
                <MpesaFlow amountCents={total()} onConfirmed={onMpesaConfirmed} />
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
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
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
