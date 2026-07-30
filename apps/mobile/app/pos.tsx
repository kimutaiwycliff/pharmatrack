import { useEffect, useState } from "react"
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { router } from "expo-router"
import { formatKES } from "@pharmatrack/core"
import Product from "../src/db/models/Product"
import { searchLocalProducts } from "../src/lib/sync/catalogue"
import { buildCashSalePayload, queueSale } from "../src/lib/sync/sales"
import { useSyncEngine } from "../src/lib/sync/useSyncEngine"
import { useSessionStore } from "../src/store/session"
import { useCartStore } from "../src/store/cart"
import { signOut } from "../src/lib/auth-client"

function randomUUID(): string {
  // crypto.randomUUID isn't available in the Hermes runtime; RFC4122-ish v4.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export default function Pos() {
  const { branchId, loadMe, loaded } = useSessionStore()
  const { isOnline, lastSyncedAt } = useSyncEngine(branchId)
  const { items, addProduct, incrementQty, clear, subtotal, total } = useCartStore()

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Product[]>([])
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

      {!loaded ? (
        <Text style={styles.receiptText}>Loading…</Text>
      ) : (
        <>
          <TextInput style={styles.input} placeholder="Search products" value={query} onChangeText={setQuery} />
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
                <Text>{formatKES(Math.round(item.sellingPrice * 100))}</Text>
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
                <Text style={{ flex: 1 }}>{item.productName}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  statusBadge: { fontSize: 12, color: "#555" },
  link: { color: "#2563eb" },
  title: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, fontSize: 15 },
  productRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderColor: "#eee" },
  productName: { flex: 1 },
  cartRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 8 },
  qtyButton: { fontSize: 20, paddingHorizontal: 10 },
  qty: { width: 24, textAlign: "center" },
  totalText: { fontSize: 16, fontWeight: "600" },
  button: { backgroundColor: "#111", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  error: { color: "#c0392b" },
  receiptText: { fontSize: 16, textAlign: "center", marginTop: 8 },
})
