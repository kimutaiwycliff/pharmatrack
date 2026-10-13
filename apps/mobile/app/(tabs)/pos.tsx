import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ScrollView, StyleSheet, View, useWindowDimensions, type TextInput } from "react-native"
import Animated from "react-native-reanimated"
import { useShallow } from "zustand/react/shallow"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import type { BarcodeScanEvent } from "@pharmatrack/core"
import { env } from "../../src/lib/env"
import { AllowanceError, commitDeviceSale } from "../../src/lib/sync/commit-sale"
import { withTimeout } from "../../src/lib/errors"
import { refreshSyncState, scheduleSoonSync } from "../../src/lib/sync/engine"
import type { PaymentInput } from "../../src/lib/sync/core/payload"
import { useSyncStore } from "../../src/store/sync"
import { useStaffStore } from "../../src/store/staff"
import { flushCartPersistence, useCartStore } from "../../src/store/cart"
import { commitLocalSale } from "../../src/repo/sales"
import { getCurrentStaff } from "../../src/lib/local-auth"
import { fetchMpesaAvailability, type MpesaAvailability } from "../../src/lib/mpesa"
import { useSessionStore } from "../../src/store/session"
import { useShiftStore } from "../../src/store/shift"
import { confirmSignOut } from "../../src/lib/auth-client"
import { haptics } from "../../src/lib/haptics"
import { useMotion } from "../../src/lib/motion"
import { useTheme } from "../../src/theme/useTheme"
import { space, TABLET_MIN_WIDTH, radius, type Theme } from "../../src/theme/tokens"
import {
  Button, Card, DeviceGate, FormScroll, HardwareScanCatcher, IconButton, Screen, SellingLock, Sheet, StatusBadge, SyncBanners,
  SyncStatusBar, Text,
} from "../../src/components"
import { addScanned, topUpAllowance } from "../../src/features/pos/actions"
import { baseQtyInCart, cartTotals, toCartLineInput } from "../../src/features/pos/logic/cart"
import { checkoutErrorMessage } from "../../src/features/pos/logic/checkoutError"
import { mpesaUnavailableNote } from "../../src/features/pos/logic/mpesaNote"
import { buildReceiptData, type ReceiptData, type ReceiptPayment } from "../../src/features/pos/logic/receipt"
import { createTapGuard } from "../../src/features/pos/logic/tapGuard"
import { ProductBrowser, type ProductBrowserHandle } from "../../src/features/pos/components/ProductBrowser"
import { CartLines } from "../../src/features/pos/components/CartLines"
import { CartSummaryBar, CartTotals } from "../../src/features/pos/components/CartSummary"
import { PaymentSheet, type PaymentSheetProps } from "../../src/features/pos/components/PaymentSheet"
import { ReceiptView } from "../../src/features/pos/components/ReceiptView"
import { PosMenu, type PosMenuAction } from "../../src/features/pos/components/PosMenu"

const OFFLINE_EDITION = env.EXPO_PUBLIC_OFFLINE_MODE
const CART_PANEL_WIDTH = 400
// M-Pesa availability: each try is time-limited; failures retry with backoff.
const MPESA_CHECK_TIMEOUT_MS = 15_000
const MPESA_RETRY_DELAYS_MS = [2_000, 8_000, 30_000]
const UNCHECKED: MpesaAvailability = { available: false, planAllowed: false, configured: false, failed: true }

/** Wait one frame so a just-set spinner paints before the synchronous SQLite commit blocks the JS thread. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

// A double tap on a navigation button must not push the same screen twice.
const navGuard = createTapGuard(800)
function go(path: "/scan" | "/switch-user" | "/shifts") {
  if (navGuard()) router.push(path)
}

// R2 POS. Phone: search on top, quick-add + results below, a persistent
// "N items · Pay" bar; the cart opens in a sheet. Tablet (≥ 768 dp, either
// orientation): search left, cart + totals + Pay always visible right.
// Sales still go through commitDeviceSale (online build) / commitLocalSale
// (Offline Edition) exactly as R1 — this file only changed the UI around them.
export default function Pos() {
  const theme = useTheme()
  const m = useMotion()
  const styles = useMemo(() => createStyles(theme), [theme])
  const { width } = useWindowDimensions()
  const tablet = width >= TABLET_MIN_WIDTH

  // Only the fields used here (not the whole stores), so unrelated updates don't re-render the till.
  const { branchId, branches, loadMe, loaded, sessionError } = useSessionStore(
    useShallow((s) => ({ branchId: s.branchId, branches: s.branches, loadMe: s.loadMe, loaded: s.loaded, sessionError: s.error })),
  )
  const { activeShift, loadActiveShift } = useShiftStore(useShallow((s) => ({ activeShift: s.activeShift, loadActiveShift: s.loadActiveShift })))
  // R1: the app-wide sync engine (mounted in the root layout) owns syncing;
  // this screen only reads its state — just the fields it renders, so a
  // progress tick or pending-count change doesn't re-render the whole till.
  const { isOnline, lastSyncAt, device, syncStatus, locked } = useSyncStore(
    useShallow((s) => ({ isOnline: s.online, lastSyncAt: s.lastSyncAt, device: s.device, syncStatus: s.status, locked: s.lock.locked })),
  )
  const currentStaff = useStaffStore((s) => s.current)
  // Only whether the cart has lines — rows, tiles, the bar and the payment
  // sheet subscribe to the details they show themselves.
  const hasItems = useCartStore((s) => s.items.length > 0)

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
  const searchRef = useRef<TextInput>(null)
  const browserRef = useRef<ProductBrowserHandle>(null)
  // Refs, not state: a second tap can arrive before React re-renders.
  const paying = useRef(false)

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

  // Mirrors the web POS's mpesaAvailable query, but a failed check (weak
  // signal on open) is retried with backoff and again when the phone comes
  // back online, so the M-Pesa/Split tabs appear without restarting the app.
  useEffect(() => {
    if (OFFLINE_EDITION || !isOnline) return
    if (mpesaAvailability && !mpesaAvailability.failed) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = async (attempt: number) => {
      const result = await withTimeout(fetchMpesaAvailability(), MPESA_CHECK_TIMEOUT_MS).catch(() => UNCHECKED)
      if (!alive) return
      setMpesaAvailability(result)
      const delay = MPESA_RETRY_DELAYS_MS[attempt]
      if (result.failed && delay !== undefined) timer = setTimeout(() => void check(attempt + 1), delay)
    }
    void check(0)
    return () => {
      alive = false
      clearTimeout(timer)
    }
    // Re-run only when connectivity changes (the retries above cover a failed check).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline])
  // M-Pesa/Split are only offered when the tenant's plan+config allow STK
  // push at all; while loading they stay hidden and the sheet says why.
  const mpesaOffered = mpesaAvailability?.available ?? false
  // Offline before the first check: say it'll be checked online, not "Checking…".
  const mpesaNote = mpesaUnavailableNote(mpesaAvailability ?? (isOnline ? null : UNCHECKED), OFFLINE_EDITION)

  const onHardwareScan = useCallback((event: BarcodeScanEvent) => {
    void addScanned(event.raw)
  }, [])

  // Stable, so the memoised cart bar / product list keep their props.
  const openPayment = useCallback(() => {
    setCheckoutError(null)
    setCartOpen(false)
    setPayNonce((n) => n + 1)
    setPayOpen(true)
  }, [])
  const openCart = useCallback(() => setCartOpen(true), [])
  const cartBar = useMemo(() => <CartSummaryBar onOpenCart={openCart} onPay={openPayment} />, [openCart, openPayment])

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
    // The sale is already committed to SQLite here (commitDeviceSale is
    // synchronous; commitLocalSale was awaited) — only now does the reveal
    // start: the payment sheet slides away while the receipt hero plays
    // (ReceiptView fires the success haptic as its check mark completes).
    cart.clear()
    setPayOpen(false)
    setCartOpen(false)
    browserRef.current?.clear()
    setReceipt({ data, queued: !OFFLINE_EDITION && !useSyncStore.getState().online })
    setRefreshKey((k) => k + 1)
  }

  /**
   * Every pay handler runs through here: one checkout at a time. A second tap
   * (or a queued tap landing after the cart was emptied) is ignored instead of
   * running against a sold cart.
   */
  async function oneCheckout(run: () => Promise<void>): Promise<void> {
    if (paying.current) return
    paying.current = true
    try {
      await run()
    } finally {
      paying.current = false
    }
  }

  function failCheckout(err: unknown) {
    if (__DEV__ && !(err instanceof AllowanceError)) console.warn("[checkout]", err)
    haptics.error()
    // The commit is one transaction: on failure nothing was saved and the cart is untouched.
    setCheckoutError(checkoutErrorMessage(err))
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
    flushCartPersistence()
    setCommitting(true)
    try {
      await nextFrame()
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
      failCheckout(err)
    } finally {
      setCommitting(false)
    }
  }

  const onCash = (tenderedCents: number) => oneCheckout(() => payCash(tenderedCents))

  async function payCash(tenderedCents: number) {
    // Already sold (a late tap as the sheet closes) — nothing to do.
    if (useCartStore.getState().items.length === 0) return
    setCheckoutError(null)
    const total = cartTotals(useCartStore.getState().items).total
    if (!activeShift) {
      setCheckoutError("Clock in before taking sales")
      return
    }
    if (tenderedCents < total) {
      setCheckoutError("Enter a tendered amount covering the total")
      return
    }
    const receiptPayment: ReceiptPayment = { label: "Cash", paidCents: tenderedCents, changeCents: tenderedCents - total, mpesaReference: null }
    if (OFFLINE_EDITION) {
      if (!branchId) {
        setCheckoutError("No branch selected")
        return
      }
      flushCartPersistence()
      setCommitting(true)
      try {
        await nextFrame()
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
        failCheckout(err)
      } finally {
        setCommitting(false)
      }
      return
    }
    await commitOnline({ method: "cash", tenderedCents }, receiptPayment)
  }

  const onMpesa = (reference: string | null) =>
    oneCheckout(async () => {
      if (useCartStore.getState().items.length === 0) return
      const total = cartTotals(useCartStore.getState().items).total
      await commitOnline(
        { method: "mpesa", reference, verified: true },
        { label: "M-Pesa", paidCents: total, changeCents: 0, mpesaReference: reference },
      )
    })

  const onTill = (code: string | null) =>
    oneCheckout(async () => {
      if (useCartStore.getState().items.length === 0) return
      const total = cartTotals(useCartStore.getState().items).total
      await commitOnline(
        { method: "mpesa", reference: code, verified: false },
        { label: "M-Pesa till", paidCents: total, changeCents: 0, mpesaReference: code },
      )
    })

  const onSplit = (cashCents: number, mpesaCents: number, reference: string | null) =>
    oneCheckout(async () => {
      if (useCartStore.getState().items.length === 0) return
      await commitOnline(
        { method: "split", cashCents, mpesaCents, reference, verified: true },
        { label: `Cash ${(cashCents / 100).toLocaleString("en-KE")} + M-Pesa`, paidCents: cashCents + mpesaCents, changeCents: 0, mpesaReference: reference },
      )
    })

  const menuActions: PosMenuAction[] = [
    { label: "Scan with camera", icon: "camera-outline", onPress: () => go("/scan") },
    ...(OFFLINE_EDITION ? [] : [{ label: "Switch user", icon: "people-outline" as const, onPress: () => go("/switch-user") }]),
    { label: "Shifts", icon: "time-outline", onPress: () => go("/shifts") },
    { label: "Sign out", icon: "log-out-outline", onPress: confirmSignOut, danger: true },
  ]

  const header = (
    <View style={styles.header}>
      <View style={styles.headerStatus}>{OFFLINE_EDITION ? <StatusBadge status="ok" label="Offline edition" /> : <SyncStatusBar />}</View>
      <View style={styles.headerActions}>
        <IconButton icon="barcode-outline" accessibilityLabel="Scan with camera" onPress={() => go("/scan")} />
        <IconButton icon="ellipsis-vertical" accessibilityLabel="More options" onPress={() => setMenuOpen(true)} />
      </View>
    </View>
  )

  // R1 gates (online build): registered phone → selling not locked → someone
  // chosen to sell → session loaded → an open local shift.
  const gateKind =
    !OFFLINE_EDITION && (!device || syncStatus === "revoked")
      ? "device"
      : !OFFLINE_EDITION && locked
        ? "lock"
        : !OFFLINE_EDITION && !currentStaff
          ? "staff"
          : !loaded
            ? sessionError
              ? "error"
              : "loading"
            : !activeShift
              ? "shift"
              : null

  const gate =
    !OFFLINE_EDITION && (!device || syncStatus === "revoked") ? (
      <DeviceGate />
    ) : !OFFLINE_EDITION && locked ? (
      <SellingLock />
    ) : !OFFLINE_EDITION && !currentStaff ? (
      <Card style={styles.gateCard}>
        <Text align="center">Choose who is selling on this phone</Text>
        <Button
          title="Choose staff"
          onPress={() => go("/switch-user")}
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
          onPress={() => go("/shifts")}
          leadingIcon={<Ionicons name="time-outline" size={18} color={theme.onAccent} />}
        />
      </Card>
    ) : null

  // The search box, quick add and product list (they own the search text, so
  // typing re-renders only them). Memoised: the till re-rendering for sync
  // state or a sheet opening doesn't re-render the list.
  const searchKey = `${refreshKey}:${lastSyncAt ?? ""}`
  const browser = (children?: ReactNode) => (
    <ProductBrowser ref={browserRef} inputRef={searchRef} refreshKey={searchKey} tablet={tablet} onFocusChange={setSearchFocused}>
      {children}
    </ProductBrowser>
  )

  const selling = (
    <Animated.View key="selling" entering={m.fadeIn} style={styles.pane}>
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
          <View style={styles.leftPane}>{browser()}</View>
          <View style={[styles.cartPanel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <View style={styles.cartHead}>
              <Text variant="title" accessibilityRole="header">
                Cart
              </Text>
              {hasItems ? (
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
        browser(cartBar)
      )}
    </Animated.View>
  )

  return (
    <Screen style={styles.container} edges={["top", "left", "right"]}>
      {header}
      {OFFLINE_EDITION ? null : <SyncBanners />}
      {/* R3: gates can hold an input (DeviceGate's phone name) — scroll + lift them above the keyboard. */}
      {/* Gate ↔ till ↔ receipt swap with a quick cross-fade. (No layout
          transition here: it would also animate every keyboard open/close.) */}
      {gate ? (
        <Animated.View key={`gate-${gateKind}`} entering={m.fadeIn} exiting={m.fadeOut} style={styles.flex}>
          <FormScroll>{gate}</FormScroll>
        </Animated.View>
      ) : receipt ? (
        <Animated.View key={`receipt-${receipt.data.receiptNumber}`} entering={m.fadeIn} exiting={m.fadeOut} style={styles.flex}>
          <ReceiptView
            receipt={receipt.data}
            queued={receipt.queued}
            showSyncState={!OFFLINE_EDITION}
            onNewSale={() => {
              setReceipt(null)
              if (tablet) searchRef.current?.focus()
            }}
          />
        </Animated.View>
      ) : (
        selling
      )}

      <Sheet open={cartOpen && !tablet} onClose={() => setCartOpen(false)} title="Cart" snapPoints={["88%"]} scrollable footer={<CartTotals onPay={openPayment} />}>
        <CartLines />
      </Sheet>
      <CartPaymentSheet
        key={payNonce}
        open={payOpen}
        onClose={() => setPayOpen(false)}
        mpesaOffered={mpesaOffered}
        mpesaNote={mpesaNote}
        isOnline={isOnline}
        committing={committing}
        error={checkoutError}
        onCash={onCash}
        onMpesa={onMpesa}
        onTill={onTill}
        onSplit={onSplit}
      />
      <PosMenu open={menuOpen} onClose={() => setMenuOpen(false)} actions={menuActions} />
    </Screen>
  )
}

/** The payment sheet reads the cart itself so the till screen doesn't re-render per line. */
function CartPaymentSheet(props: Omit<PaymentSheetProps, "items">) {
  const items = useCartStore((s) => s.items)
  return <PaymentSheet {...props} items={items} />
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { gap: space.sm, paddingBottom: space.sm },
    flex: { flex: 1 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
    headerStatus: { flex: 1 },
    headerActions: { flexDirection: "row", gap: space.xxs },
    gateCard: { gap: space.sm },
    pane: { flex: 1, gap: space.sm },
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
