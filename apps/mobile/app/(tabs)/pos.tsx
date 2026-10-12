import { useCallback, useEffect, useRef, useState } from "react"
import { ScrollView, StyleSheet, View, useWindowDimensions, type TextInput } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { FlashList } from "@shopify/flash-list"
import type { BarcodeScanEvent } from "@pharmatrack/core"
import { env } from "../../src/lib/env"
import { AllowanceError, commitDeviceSale } from "../../src/lib/sync/commit-sale"
import { refreshSyncState, scheduleSoonSync } from "../../src/lib/sync/engine"
import type { PaymentInput } from "../../src/lib/sync/core/payload"
import { useSyncStore } from "../../src/store/sync"
import { useStaffStore } from "../../src/store/staff"
import { useCartStore } from "../../src/store/cart"
import { commitLocalSale } from "../../src/repo/sales"
import { getCurrentStaff } from "../../src/lib/local-auth"
import { fetchMpesaAvailability, type MpesaAvailability } from "../../src/lib/mpesa"
import { useSessionStore } from "../../src/store/session"
import { useShiftStore } from "../../src/store/shift"
import { confirmSignOut } from "../../src/lib/auth-client"
import { haptics } from "../../src/lib/haptics"
import { useTheme } from "../../src/theme/useTheme"
import { space, TABLET_MIN_WIDTH, radius, type Theme } from "../../src/theme/tokens"
import {
  Button, Card, Chip, DeviceGate, EmptyState, FormScroll, HardwareScanCatcher, IconButton, Screen, SellingLock, Sheet, StatusBadge, SyncBanners,
  SyncStatusBar, Text,
} from "../../src/components"
import { addScanned, addToCart, topUpAllowance, useRecentScans } from "../../src/features/pos/actions"
import { getProduct } from "../../src/features/pos/data"
import { baseQtyInCart, cartTotals, remainingFor, toCartLineInput } from "../../src/features/pos/logic/cart"
import { buildReceiptData, type ReceiptData, type ReceiptPayment } from "../../src/features/pos/logic/receipt"
import { usePosSearch, type PosProduct } from "../../src/features/pos/usePosSearch"
import { SearchBar } from "../../src/features/pos/components/SearchBar"
import { ProductResultRow, QuickAddTile } from "../../src/features/pos/components/ProductParts"
import { CartLines } from "../../src/features/pos/components/CartLines"
import { CartSummaryBar, CartTotals } from "../../src/features/pos/components/CartSummary"
import { PaymentSheet } from "../../src/features/pos/components/PaymentSheet"
import { ReceiptView } from "../../src/features/pos/components/ReceiptView"
import { PosMenu, type PosMenuAction } from "../../src/features/pos/components/PosMenu"

const OFFLINE_EDITION = env.EXPO_PUBLIC_OFFLINE_MODE
const CART_PANEL_WIDTH = 400

// R2 POS. Phone: search on top, quick-add + results below, a persistent
// "N items · Pay" bar; the cart opens in a sheet. Tablet (≥ 768 dp, either
// orientation): search left, cart + totals + Pay always visible right.
// Sales still go through commitDeviceSale (online build) / commitLocalSale
// (Offline Edition) exactly as R1 — this file only changed the UI around them.
export default function Pos() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { width } = useWindowDimensions()
  const tablet = width >= TABLET_MIN_WIDTH

  const { branchId, branches, loadMe, loaded, error: sessionError } = useSessionStore()
  const { activeShift, loadActiveShift } = useShiftStore()
  // R1: the app-wide sync engine (mounted in the root layout) owns syncing;
  // this screen only reads its state.
  const { online: isOnline, lastSyncAt, device, status: syncStatus, lock } = useSyncStore()
  const currentStaff = useStaffStore((s) => s.current)
  const items = useCartStore((s) => s.items)
  const recent = useRecentScans((s) => s.recent)

  const [query, setQuery] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)
  const [searchFocused, setSearchFocused] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [payNonce, setPayNonce] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<{ data: ReceiptData; queued: boolean } | null>(null)
  const [mpesaAvailability, setMpesaAvailability] = useState<MpesaAvailability | null>(null)
  const [gridWidth, setGridWidth] = useState(0)
  const searchRef = useRef<TextInput>(null)

  const { results, quickAdd } = usePosSearch(query, `${refreshKey}:${lastSyncAt ?? ""}`)

  useEffect(() => {
    loadMe()
  }, [loadMe])

  // The shift gate follows whoever is selling (local shifts, R1 rule 5).
  useEffect(() => {
    loadActiveShift()
  }, [loadActiveShift, currentStaff?.id])

  // A restored cart (crash/restart) or a sync may have changed what's sellable.
  useEffect(() => {
    useCartStore.getState().refreshLimits()
  }, [lastSyncAt])

  // Fetched once on screen load — mirrors the web POS's mpesaAvailable query.
  useEffect(() => {
    if (OFFLINE_EDITION) return
    fetchMpesaAvailability().then(setMpesaAvailability)
  }, [])
  // M-Pesa/Split are only offered when the tenant's plan+config allow STK
  // push at all; while loading they stay hidden, same as "not available".
  const mpesaOffered = mpesaAvailability?.available ?? false

  const onHardwareScan = useCallback((event: BarcodeScanEvent) => {
    void addScanned(event.raw)
  }, [])

  const add = useCallback((p: PosProduct) => {
    void addToCart(p)
  }, [])

  function openPayment() {
    setCheckoutError(null)
    setCartOpen(false)
    setPayNonce((n) => n + 1)
    setPayOpen(true)
  }

  function finishSale(receiptNumber: string, payment: ReceiptPayment, cashier: string) {
    const cart = useCartStore.getState()
    const data = buildReceiptData(
      cart.items,
      {
        shopName: branches.find((b) => b.id === branchId)?.name ?? "PharmaTrack",
        receiptNumber,
        soldAtMs: Date.now(),
        cashier,
      },
      payment,
    )
    cart.clear()
    haptics.success()
    setPayOpen(false)
    setCartOpen(false)
    setQuery("")
    setReceipt({ data, queued: !OFFLINE_EDITION && !useSyncStore.getState().online })
    setRefreshKey((k) => k + 1)
  }

  // R1 rules 2 + 7: the one commit path for the online build — allowance
  // check, receipt number, stock/allowance decrement and outbox row in a
  // single SQLite transaction. Retries once after a top-up when online.
  async function commitOnline(payment: PaymentInput, receiptPayment: ReceiptPayment): Promise<void> {
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
          lines: useCartStore.getState().items.map(toCartLineInput),
          payment,
          overrideClientId: live.lock.underOverride && live.override ? live.override.client_id : null,
        })
      let result
      try {
        result = attempt()
      } catch (err) {
        if (!(err instanceof AllowanceError)) throw err
        const wanted = baseQtyInCart(useCartStore.getState().items, err.productId)
        if (!(await topUpAllowance(err.productId, wanted - err.available))) {
          useCartStore.getState().refreshLimits([err.productId])
          throw err
        }
        result = attempt()
      }
      finishSale(result.receiptNumber, receiptPayment, currentStaff.name)
      refreshSyncState()
      scheduleSoonSync()
    } catch (err) {
      haptics.error()
      setCheckoutError(err instanceof Error ? err.message : String(err))
    } finally {
      setCommitting(false)
    }
  }

  async function onCash(tenderedCents: number) {
    setCheckoutError(null)
    const total = cartTotals(useCartStore.getState().items).total
    if (!activeShift) {
      setCheckoutError("Clock in before taking sales")
      return
    }
    if (useCartStore.getState().items.length === 0 || tenderedCents < total) {
      setCheckoutError("Enter a tendered amount covering the total")
      return
    }
    const receiptPayment: ReceiptPayment = { label: "Cash", paidCents: tenderedCents, changeCents: tenderedCents - total, mpesaReference: null }
    if (OFFLINE_EDITION) {
      if (!branchId) {
        setCheckoutError("No branch selected")
        return
      }
      setCommitting(true)
      try {
        const staffRow = await getCurrentStaff()
        const { receiptNumber } = await commitLocalSale({
          branchId,
          shiftId: activeShift.id,
          cashierId: staffRow?.id ?? "unknown",
          items: useCartStore.getState().items,
          paymentMethod: "cash",
          amountTenderedCents: tenderedCents,
          changeGivenCents: tenderedCents - total,
        })
        finishSale(receiptNumber, receiptPayment, staffRow?.fullName ?? "Staff")
      } catch (err) {
        haptics.error()
        setCheckoutError(err instanceof Error ? err.message : String(err))
      } finally {
        setCommitting(false)
      }
      return
    }
    await commitOnline({ method: "cash", tenderedCents }, receiptPayment)
  }

  async function onMpesa(reference: string | null) {
    if (useCartStore.getState().items.length === 0) return
    const total = cartTotals(useCartStore.getState().items).total
    await commitOnline(
      { method: "mpesa", reference, verified: true },
      { label: "M-Pesa", paidCents: total, changeCents: 0, mpesaReference: reference },
    )
  }

  async function onTill(code: string | null) {
    if (useCartStore.getState().items.length === 0) return
    const total = cartTotals(useCartStore.getState().items).total
    await commitOnline(
      { method: "mpesa", reference: code, verified: false },
      { label: "M-Pesa till", paidCents: total, changeCents: 0, mpesaReference: code },
    )
  }

  async function onSplit(cashCents: number, mpesaCents: number, reference: string | null) {
    if (useCartStore.getState().items.length === 0) return
    await commitOnline(
      { method: "split", cashCents, mpesaCents, reference, verified: true },
      { label: `Cash ${(cashCents / 100).toLocaleString("en-KE")} + M-Pesa`, paidCents: cashCents + mpesaCents, changeCents: 0, mpesaReference: reference },
    )
  }

  function onSubmitSearch() {
    // Enter on a single match adds it (keyboard-only cashiers).
    if (results.length === 1 && results[0]) add(results[0])
  }

  async function addRecent(productId: string) {
    const p = await getProduct(productId)
    if (p) await addToCart(p)
  }

  const menuActions: PosMenuAction[] = [
    { label: "Scan with camera", icon: "camera-outline", onPress: () => router.push("/scan") },
    ...(OFFLINE_EDITION ? [] : [{ label: "Switch user", icon: "people-outline" as const, onPress: () => router.push("/switch-user") }]),
    { label: "Shifts", icon: "time-outline", onPress: () => router.push("/shifts") },
    { label: "Sign out", icon: "log-out-outline", onPress: confirmSignOut, danger: true },
  ]

  const header = (
    <View style={styles.header}>
      <View style={styles.headerStatus}>{OFFLINE_EDITION ? <StatusBadge status="ok" label="Offline edition" /> : <SyncStatusBar />}</View>
      <View style={styles.headerActions}>
        <IconButton icon="barcode-outline" accessibilityLabel="Scan with camera" onPress={() => router.push("/scan")} />
        <IconButton icon="ellipsis-vertical" accessibilityLabel="More options" onPress={() => setMenuOpen(true)} />
      </View>
    </View>
  )

  // R1 gates (online build): registered phone → selling not locked → someone
  // chosen to sell → session loaded → an open local shift.
  const gate =
    !OFFLINE_EDITION && (!device || syncStatus === "revoked") ? (
      <DeviceGate />
    ) : !OFFLINE_EDITION && lock.locked ? (
      <SellingLock />
    ) : !OFFLINE_EDITION && !currentStaff ? (
      <Card style={styles.gateCard}>
        <Text align="center">Choose who is selling on this phone</Text>
        <Button
          title="Choose staff"
          onPress={() => router.push("/switch-user")}
          leadingIcon={<Ionicons name="people-outline" size={18} color={theme.onAccent} />}
        />
      </Card>
    ) : !loaded ? (
      sessionError ? (
        <Card style={styles.gateCard}>
          <Text tone="danger">{sessionError}</Text>
          <Button
            title="Retry"
            variant="secondary"
            onPress={() => loadMe()}
            leadingIcon={<Ionicons name="refresh-outline" size={18} color={theme.text} />}
          />
        </Card>
      ) : (
        <Text align="center" tone="secondary">
          Loading…
        </Text>
      )
    ) : !activeShift ? (
      <Card style={styles.gateCard}>
        <Text align="center">Clock in before taking sales</Text>
        <Button
          title="Go to Shifts"
          onPress={() => router.push("/shifts")}
          leadingIcon={<Ionicons name="time-outline" size={18} color={theme.onAccent} />}
        />
      </Card>
    ) : null

  const columns = tablet ? 4 : 2
  const tileWidth = gridWidth > 0 ? Math.floor((gridWidth - space.sm * (columns - 1)) / columns) : 0

  const quickSection =
    query.trim() === "" ? (
      <View style={styles.quickSection} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
        {recent.length > 0 ? (
          <>
            <Text variant="label" tone="secondary">
              Recently scanned
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow} keyboardShouldPersistTaps="handled">
              {recent.map((r) => (
                <Chip key={r.productId} label={r.name} accessibilityLabel={`Add ${r.name} again`} onPress={() => void addRecent(r.productId)} />
              ))}
            </ScrollView>
          </>
        ) : null}
        {quickAdd.length > 0 && tileWidth > 0 ? (
          <>
            <Text variant="label" tone="secondary">
              Quick add
            </Text>
            <View style={styles.grid}>
              {quickAdd.map((p) => (
                <QuickAddTile
                  key={p.productId}
                  product={p}
                  width={tileWidth}
                  left={remainingFor(items, p.productId, p.sellable)}
                  onPress={() => add(p)}
                />
              ))}
            </View>
          </>
        ) : null}
        <Text variant="label" tone="secondary">
          All products
        </Text>
      </View>
    ) : null

  const productList = (
    <FlashList
      data={results}
      keyExtractor={(p) => p.productId}
      extraData={items}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={quickSection}
      renderItem={({ item }) => <ProductResultRow product={item} left={remainingFor(items, item.productId, item.sellable)} onPress={() => add(item)} />}
      ListEmptyComponent={
        <EmptyState
          icon={<Ionicons name="search-outline" size={32} color={theme.textTertiary} />}
          message={query ? `No products match "${query.trim()}"` : "No products on this phone yet — sync first"}
        />
      }
      contentContainerStyle={styles.listContent}
    />
  )

  const searchBar = (
    <SearchBar
      ref={searchRef}
      value={query}
      onChangeText={setQuery}
      onScan={(code) => void addScanned(code)}
      onSubmitSearch={onSubmitSearch}
      onFocusChange={setSearchFocused}
    />
  )

  const selling = (
    <>
      {/* Catches a USB/Bluetooth scanner when no text field has focus. */}
      <HardwareScanCatcher onScan={onHardwareScan} enabled={!searchFocused && !payOpen && !menuOpen && !receipt} />
      {/* Offline Edition: branch/shift may come from the cache — informational only. */}
      {sessionError && OFFLINE_EDITION ? (
        <Text variant="caption" tone="warning">
          {sessionError}
        </Text>
      ) : null}
      {tablet ? (
        <View style={styles.split}>
          <View style={styles.leftPane}>
            {searchBar}
            <View style={styles.flex}>{productList}</View>
          </View>
          <View style={[styles.cartPanel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <View style={styles.cartHead}>
              <Text variant="title" accessibilityRole="header">
                Cart
              </Text>
              {items.length > 0 ? (
                <Button title="Clear" variant="ghost" size="sm" onPress={() => useCartStore.getState().clear()} accessibilityLabel="Clear cart" />
              ) : null}
            </View>
            <ScrollView style={styles.flex} contentContainerStyle={styles.cartScroll} keyboardShouldPersistTaps="handled">
              <CartLines />
            </ScrollView>
            <CartTotals onPay={openPayment} />
          </View>
        </View>
      ) : (
        <>
          {searchBar}
          <View style={styles.flex}>{productList}</View>
          <CartSummaryBar onOpenCart={() => setCartOpen(true)} onPay={openPayment} />
        </>
      )}
    </>
  )

  return (
    <Screen style={styles.container} edges={["top", "left", "right"]}>
      {header}
      {OFFLINE_EDITION ? null : <SyncBanners />}
      {/* R3: gates can hold an input (DeviceGate's phone name) — scroll + lift them above the keyboard. */}
      {gate ? (
        <FormScroll>{gate}</FormScroll>
      ) : receipt ? (
        <ReceiptView
          receipt={receipt.data}
          queued={receipt.queued}
          showSyncState={!OFFLINE_EDITION}
          onNewSale={() => {
            setReceipt(null)
            if (tablet) searchRef.current?.focus()
          }}
        />
      ) : (
        selling
      )}

      <Sheet open={cartOpen && !tablet} onClose={() => setCartOpen(false)} title="Cart" snapPoints={["88%"]} scrollable footer={<CartTotals onPay={openPayment} />}>
        <CartLines />
      </Sheet>
      <PaymentSheet
        key={payNonce}
        open={payOpen}
        onClose={() => setPayOpen(false)}
        items={items}
        mpesaOffered={mpesaOffered}
        isOnline={isOnline}
        committing={committing}
        error={checkoutError}
        onCash={(c) => void onCash(c)}
        onMpesa={(r) => void onMpesa(r)}
        onTill={(c) => void onTill(c)}
        onSplit={(c, m, r) => void onSplit(c, m, r)}
      />
      <PosMenu open={menuOpen} onClose={() => setMenuOpen(false)} actions={menuActions} />
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { gap: space.sm, paddingBottom: space.sm },
    flex: { flex: 1 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
    headerStatus: { flex: 1 },
    headerActions: { flexDirection: "row", gap: space.xxs },
    gateCard: { gap: space.sm },
    quickSection: { gap: space.sm, paddingBottom: space.sm },
    recentRow: { gap: space.sm },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
    listContent: { paddingBottom: space.lg },
    split: { flex: 1, flexDirection: "row", gap: space.lg },
    leftPane: { flex: 1, gap: space.sm },
    cartPanel: {
      width: CART_PANEL_WIDTH,
      borderWidth: 1,
      borderRadius: radius.xl,
      padding: space.md,
      gap: space.md,
      backgroundColor: theme.surface,
    },
    cartHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    cartScroll: { paddingBottom: space.sm },
  })
}
