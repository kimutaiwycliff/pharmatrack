import { useEffect, useState } from "react"
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { router } from "expo-router"
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
      <View style={styles.container}>
        <Text style={styles.title}>Sale recorded</Text>
        <Text style={styles.receiptText}>Reference: {receipt}</Text>
        <Text style={styles.receiptText}>{isOnline ? "Syncing to server…" : "Queued — will sync once back online"}</Text>
        <Pressable style={styles.button} onPress={() => setReceipt(null)}>
          <Text style={styles.buttonText}>New sale</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.statusBadge}>{isOnline ? "Online" : "Offline — sales will queue"}</Text>
        <Pressable onPress={() => router.push("/scan")}>
          <Text style={styles.link}>Scan barcode</Text>
        </Pressable>
        <Pressable onPress={() => signOut()}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>

      {sessionError ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.error}>{sessionError}</Text>
          <Pressable style={styles.button} onPress={() => loadMe()}>
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
        </View>
      ) : !loaded ? (
        <Text style={styles.receiptText}>Loading…</Text>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Search products"
            placeholderTextColor={theme.textTertiary}
            value={query}
            onChangeText={setQuery}
          />
          <FlatList
            data={results}
            keyExtractor={(p) => p.productId}
            style={{ maxHeight: 260 }}
            renderItem={({ item }) => (
              <Pressable style={styles.productRow} onPress={() => addProduct(item)}>
                <Text style={styles.productName}>
                  {item.name}
                  {item.strength ? ` (${item.strength})` : ""}
                </Text>
                <Text style={styles.priceText}>{formatKES(Math.round(item.sellingPrice * 100))}</Text>
              </Pressable>
            )}
          />

          <Text style={styles.title}>Cart</Text>
          <FlatList
            data={items}
            keyExtractor={(i) => i.productId}
            style={{ maxHeight: 200 }}
            renderItem={({ item }) => (
              <View style={styles.cartRow}>
                <Text style={styles.cartItemName}>{item.productName}</Text>
                <Pressable onPress={() => incrementQty(item.productId, -1)}>
                  <Text style={styles.qtyButton}>−</Text>
                </Pressable>
                <Text style={styles.qty}>{item.quantity}</Text>
                <Pressable onPress={() => incrementQty(item.productId, 1)}>
                  <Text style={styles.qtyButton}>+</Text>
                </Pressable>
              </View>
            )}
          />

          <Text style={styles.totalText}>Subtotal: {formatKES(subtotal())}</Text>
          <Text style={styles.totalText}>Total: {formatKES(total())}</Text>

          <TextInput
            style={styles.input}
            placeholder="Cash tendered (KES)"
            placeholderTextColor={theme.textTertiary}
            keyboardType="decimal-pad"
            value={tendered}
            onChangeText={setTendered}
          />
          {checkoutError ? <Text style={styles.error}>{checkoutError}</Text> : null}
          <Pressable style={styles.button} onPress={onCheckout} disabled={items.length === 0}>
            <Text style={styles.buttonText}>Complete cash sale</Text>
          </Pressable>
        </>
      )}
    </View>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, padding: 16, gap: 8, backgroundColor: theme.bg },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    statusBadge: { fontSize: 12, color: theme.textSecondary },
    link: { color: theme.green },
    title: { fontSize: 18, fontWeight: "700", marginTop: 8, color: theme.text },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      padding: 10,
      fontSize: 15,
      backgroundColor: theme.surface,
      color: theme.text,
    },
    productRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderColor: theme.border,
    },
    productName: { flex: 1, color: theme.text },
    priceText: { color: theme.text },
    cartRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 8 },
    cartItemName: { flex: 1, color: theme.text },
    qtyButton: { fontSize: 20, paddingHorizontal: 10, color: theme.text },
    qty: { width: 24, textAlign: "center", color: theme.text },
    totalText: { fontSize: 16, fontWeight: "600", color: theme.text },
    button: { backgroundColor: theme.greenCta, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
    buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
    error: { color: theme.red },
    receiptText: { fontSize: 16, textAlign: "center", marginTop: 8, color: theme.text },
  })
}
