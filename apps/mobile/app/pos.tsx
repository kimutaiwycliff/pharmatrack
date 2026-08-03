import { useEffect, useState } from "react"
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { router } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { formatKES } from "@pharmatrack/core"
import type { ProductRow } from "../src/db/schema"
import { searchLocalProducts } from "../src/lib/sync/catalogue"
import { buildCashSalePayload, queueSale } from "../src/lib/sync/sales"
import { useSyncEngine } from "../src/lib/sync/useSyncEngine"
import { useSessionStore } from "../src/store/session"
import { useCartStore } from "../src/store/cart"
import { signOut } from "../src/lib/auth-client"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Card, EmptyState, Screen, StatusBadge } from "../src/components"

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
  const { isOnline, lastSyncedAt } = useSyncEngine(branchId)
  const { items, addProduct, incrementQty, clear, subtotal, total } = useCartStore()

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ProductRow[]>([])
  const [tendered, setTendered] = useState("")
  const [receipt, setReceipt] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  useEffect(() => {
    loadMe()
  }, [loadMe])

  useEffect(() => {
    searchLocalProducts(query).then(setResults)
  }, [query, lastSyncedAt])

  async function onCheckout() {
    setCheckoutError(null)
    const tenderedAmount = Number(tendered)
    if (!branchId || items.length === 0 || !tenderedAmount || tenderedAmount * 100 < total()) {
      setCheckoutError("Enter a tendered amount covering the total")
      return
    }
    const offlineReference = randomUUID()
    const payload = buildCashSalePayload({
      branchId,
      items,
      amountTendered: tenderedAmount,
      totalCents: total(),
      offlineReference,
    })
    await queueSale(payload)
    setReceipt(offlineReference)
    clear()
    setTendered("")
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
          <Pressable onPress={() => signOut()} style={styles.iconButton} accessibilityLabel="Sign out">
            <Ionicons name="log-out-outline" size={22} color={theme.text} />
          </Pressable>
        </View>
      </View>

      {sessionError ? (
        <Card style={styles.errorCard}>
          <Text style={styles.error}>{sessionError}</Text>
          <Button
            title="Retry"
            variant="secondary"
            onPress={() => loadMe()}
            icon={<Ionicons name="refresh-outline" size={18} color={theme.text} />}
          />
        </Card>
      ) : !loaded ? (
        <Text style={styles.receiptText}>Loading…</Text>
      ) : (
        <>
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
                    <Text style={styles.productName}>
                      {item.name}
                      {item.strength ? ` (${item.strength})` : ""}
                    </Text>
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

          <Card style={styles.totalsCard}>
            <Text style={styles.totalText}>Subtotal: {formatKES(subtotal())}</Text>
            <Text style={styles.totalText}>Total: {formatKES(total())}</Text>
          </Card>

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
    productName: { flex: 1, color: theme.text },
    priceText: { color: theme.text },
    cartList: { maxHeight: 200 },
    cartCard: { marginBottom: 8, paddingVertical: 8 },
    cartRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    cartItemName: { flex: 1, color: theme.text },
    qtyButton: { fontSize: 20, paddingHorizontal: 10, color: theme.text },
    qty: { width: 24, textAlign: "center", color: theme.text },
    totalsCard: { gap: 4 },
    errorCard: { gap: 8 },
    totalText: { fontSize: 16, fontWeight: "600", color: theme.text },
    newSaleButton: { marginTop: 16, minWidth: 160 },
    error: { color: theme.red },
    receiptText: { fontSize: 16, textAlign: "center", marginTop: 8, color: theme.text },
  })
}
