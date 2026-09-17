import { useEffect, useState } from "react"
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { eq } from "drizzle-orm"
import Ionicons from "@expo/vector-icons/Ionicons"
import { apiFetch } from "../src/lib/api-fetch"
import { env } from "../src/lib/env"
import { listLocalBatches, receiveLocalStock, adjustLocalStock } from "../src/repo/inventory"
import { toast } from "../src/lib/toast"
import { useSessionStore } from "../src/store/session"
import { useTheme } from "../src/theme/useTheme"
import { db } from "../src/db/database"
import { products } from "../src/db/schema"
import { printLabel, shareLabelPDF } from "../src/lib/labels/printLabel"
import type { Theme } from "../src/theme/tokens"
import { Button, Card, EmptyState, Screen, ScreenHeader } from "../src/components"

// Mirrors apps/web's receiving/adjustment flow: POST /api/batches (receive a
// new batch) and POST /api/inventory/adjust (correct an existing batch's
// quantity, with a reason — mode "delta" here, matching web's adjustment
// dialog default). GET /api/batches lists existing batches for this product
// at the active branch, same as web's BatchesSheet.

interface Batch {
  id: string
  batch_number: string
  expiry_date: string
  quantity_remaining: number
  quantity_received: number
  cost_price: string | null
}

const REASONS = ["count_correction", "damage", "expiry", "theft_loss", "return", "other"] as const
const REASON_LABEL: Record<(typeof REASONS)[number], string> = {
  count_correction: "Count correction", damage: "Damage", expiry: "Expiry write-off",
  theft_loss: "Theft / loss", return: "Customer return", other: "Other",
}

export default function ProductBatches() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { productId, productName } = useLocalSearchParams<{ productId: string; productName: string }>()
  const { branchId } = useSessionStore()

  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)

  const [showReceive, setShowReceive] = useState(false)
  const [batchNumber, setBatchNumber] = useState("")
  const [expiryDate, setExpiryDate] = useState("")
  const [qtyReceived, setQtyReceived] = useState("")
  const [costPrice, setCostPrice] = useState("")
  const [receiving, setReceiving] = useState(false)
  const [productBarcode, setProductBarcode] = useState<string | null>(null)
  const [lastReceivedQty, setLastReceivedQty] = useState<number | null>(null)
  const [printing, setPrinting] = useState<"print" | "share" | null>(null)

  const [adjustingBatch, setAdjustingBatch] = useState<Batch | null>(null)
  const [adjustDelta, setAdjustDelta] = useState("")
  const [adjustReason, setAdjustReason] = useState<(typeof REASONS)[number]>("count_correction")
  const [adjustNote, setAdjustNote] = useState("")
  const [adjusting, setAdjusting] = useState(false)

  async function load() {
    if (!productId || !branchId) return
    setLoading(true)
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        const json = await listLocalBatches(productId, branchId)
        setBatches(json.batches ?? [])
        return
      }
      const res = await apiFetch(`/api/batches?product_id=${productId}&branch_id=${branchId}`)
      const json = (await res.json()) as { batches: Batch[] }
      setBatches(json.batches ?? [])
    } catch {
      toast.error("Could not load batches")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [productId, branchId])

  useEffect(() => {
    if (!productId) return
    async function loadBarcode() {
      const [row] = await db.select({ gtin: products.gtin, barcodeRaw: products.barcodeRaw })
        .from(products).where(eq(products.productId, productId)).limit(1)
      setProductBarcode(row ? (row.gtin ?? row.barcodeRaw) : null)
    }
    loadBarcode()
  }, [productId])

  async function receiveStock() {
    const qty = parseInt(qtyReceived, 10)
    if (!batchNumber.trim()) { toast.error("Enter a batch number"); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) { toast.error("Expiry date must be YYYY-MM-DD"); return }
    if (!qty || qty <= 0) { toast.error("Enter a quantity received"); return }
    setReceiving(true)
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        await receiveLocalStock({
          productId: productId!, branchId: branchId!, batchNumber: batchNumber.trim(),
          expiryDate, quantityReceived: qty,
          costPrice: costPrice.trim() ? Number(costPrice) : null,
        })
      } else {
        const res = await apiFetch("/api/batches", {
          method: "POST",
          body: JSON.stringify({
            product_id: productId, branch_id: branchId, batch_number: batchNumber.trim(),
            expiry_date: expiryDate, quantity_received: qty,
            cost_price: costPrice.trim() ? Number(costPrice) : undefined,
          }),
        })
        const json = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(json.error ?? "Could not receive stock")
      }
      toast.success("Stock received")
      setShowReceive(false)
      setLastReceivedQty(qty)
      setBatchNumber(""); setExpiryDate(""); setQtyReceived(""); setCostPrice("")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setReceiving(false)
    }
  }

  async function handlePrintLabels(mode: "print" | "share") {
    if (!productBarcode) return
    setPrinting(mode)
    try {
      const input = { code: productBarcode, productName: productName ?? "", copies: lastReceivedQty ?? 1 }
      if (mode === "print") await printLabel(input)
      else await shareLabelPDF(input)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not print labels")
    } finally {
      setPrinting(null)
    }
  }

  async function submitAdjustment() {
    if (!adjustingBatch) return
    const delta = parseInt(adjustDelta, 10)
    if (!adjustDelta || Number.isNaN(delta) || delta === 0) { toast.error("Enter a non-zero adjustment (e.g. -5 or 10)"); return }
    setAdjusting(true)
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        await adjustLocalStock({ batchId: adjustingBatch.id, delta, reason: adjustReason, note: adjustNote.trim() || null })
      } else {
        const res = await apiFetch("/api/inventory/adjust", {
          method: "POST",
          body: JSON.stringify({ batch_id: adjustingBatch.id, mode: "delta", value: delta, reason: adjustReason, note: adjustNote.trim() || undefined }),
        })
        const json = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(json.error ?? "Could not adjust stock")
      }
      toast.success("Stock adjusted")
      setAdjustingBatch(null)
      setAdjustDelta(""); setAdjustNote("")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setAdjusting(false)
    }
  }

  return (
    <Screen>
      <ScreenHeader title={productName ?? "Batches"} />

      {showReceive ? (
        <Card style={styles.formCard}>
          <Text style={styles.formTitle}>Receive stock</Text>
          <TextInput style={styles.input} placeholder="Batch number" placeholderTextColor={theme.textTertiary} value={batchNumber} onChangeText={setBatchNumber} />
          <TextInput style={styles.input} placeholder="Expiry date (YYYY-MM-DD)" placeholderTextColor={theme.textTertiary} value={expiryDate} onChangeText={setExpiryDate} />
          <TextInput style={styles.input} placeholder="Quantity received" placeholderTextColor={theme.textTertiary} keyboardType="number-pad" value={qtyReceived} onChangeText={setQtyReceived} />
          <TextInput style={styles.input} placeholder="Cost price per unit (optional)" placeholderTextColor={theme.textTertiary} keyboardType="decimal-pad" value={costPrice} onChangeText={setCostPrice} />
          <View style={styles.formActions}>
            <Button title="Save" onPress={receiveStock} loading={receiving} style={styles.formButton} />
            <Button title="Cancel" variant="secondary" onPress={() => setShowReceive(false)} style={styles.formButton} />
          </View>
        </Card>
      ) : adjustingBatch ? (
        <Card style={styles.formCard}>
          <Text style={styles.formTitle}>Adjust batch {adjustingBatch.batch_number}</Text>
          <Text style={styles.hint}>{adjustingBatch.quantity_remaining} remaining. Enter a change (e.g. -5 for a loss, 10 to add).</Text>
          <TextInput style={styles.input} placeholder="Change (+/-)" placeholderTextColor={theme.textTertiary} keyboardType="numbers-and-punctuation" value={adjustDelta} onChangeText={setAdjustDelta} />
          <View style={styles.reasonRow}>
            {REASONS.map((r) => (
              <Pressable key={r} onPress={() => setAdjustReason(r)} style={[styles.reasonChip, adjustReason === r && styles.reasonChipActive]}>
                <Text style={[styles.reasonChipText, adjustReason === r && styles.reasonChipTextActive]}>{REASON_LABEL[r]}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={styles.input} placeholder="Note (optional)" placeholderTextColor={theme.textTertiary} value={adjustNote} onChangeText={setAdjustNote} />
          <View style={styles.formActions}>
            <Button title="Save" onPress={submitAdjustment} loading={adjusting} style={styles.formButton} />
            <Button title="Cancel" variant="secondary" onPress={() => setAdjustingBatch(null)} style={styles.formButton} />
          </View>
        </Card>
      ) : (
        <Button title="Receive stock" onPress={() => setShowReceive(true)} icon={<Ionicons name="add-circle-outline" size={18} color="#fff" />} style={styles.receiveButton} />
      )}

      {lastReceivedQty != null && productBarcode && !showReceive && !adjustingBatch && (
        <Card style={styles.printPromptCard}>
          <Text style={styles.printPromptText}>Print stickers for the {lastReceivedQty} unit(s) just received?</Text>
          <View style={styles.formActions}>
            <Button
              title="Print"
              onPress={() => handlePrintLabels("print")}
              loading={printing === "print"}
              icon={<Ionicons name="print-outline" size={16} color="#fff" />}
              style={styles.formButton}
            />
            <Button
              title="Share PDF"
              variant="secondary"
              onPress={() => handlePrintLabels("share")}
              loading={printing === "share"}
              style={styles.formButton}
            />
          </View>
        </Card>
      )}

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={theme.green} /></View>
      ) : (
        <FlatList
          data={batches}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon={<Ionicons name="cube-outline" size={32} color={theme.textTertiary} />} message="No batches yet" />}
          renderItem={({ item }) => (
            <Pressable onPress={() => { setAdjustingBatch(item); setShowReceive(false) }}>
              <Card style={styles.batchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.batchNumber}>{item.batch_number}</Text>
                  <Text style={styles.batchMeta}>Expires {item.expiry_date}</Text>
                </View>
                <Text style={styles.batchQty}>{item.quantity_remaining} left</Text>
              </Card>
            </Pressable>
          )}
        />
      )}
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    receiveButton: { marginBottom: 12 },
    formCard: { gap: 10, marginBottom: 12 },
    formTitle: { fontSize: 15, fontWeight: "700", color: theme.text },
    printPromptCard: { gap: 8, marginBottom: 12, borderColor: theme.green, borderWidth: 1 },
    printPromptText: { fontSize: 13, color: theme.green, fontWeight: "600" },
    hint: { fontSize: 12, color: theme.textSecondary, marginTop: -4 },
    input: {
      borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12,
      fontSize: 15, backgroundColor: theme.surface, color: theme.text,
    },
    formActions: { flexDirection: "row", gap: 8, marginTop: 4 },
    formButton: { flex: 1 },
    reasonRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    reasonChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: theme.border },
    reasonChipActive: { backgroundColor: theme.greenCta, borderColor: theme.greenCta },
    reasonChipText: { fontSize: 12, color: theme.textSecondary },
    reasonChipTextActive: { color: "#fff", fontWeight: "600" },
    list: { gap: 8, paddingBottom: 24 },
    batchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    batchNumber: { fontSize: 14, fontWeight: "600", color: theme.text },
    batchMeta: { fontSize: 12, color: theme.textTertiary, marginTop: 2 },
    batchQty: { fontSize: 14, fontWeight: "700", color: theme.text },
  })
}
