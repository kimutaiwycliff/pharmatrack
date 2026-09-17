import { useEffect, useState } from "react"
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { apiFetch } from "../src/lib/api-fetch"
import { env } from "../src/lib/env"
import { listLocalPrescriptions, createLocalPrescription } from "../src/repo/clinical"
import { toast } from "../src/lib/toast"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Card, EmptyState, Screen, ScreenHeader } from "../src/components"

// Mirrors apps/web/app/api/prescriptions/route.ts exactly. DUR (Drug
// Utilization Review) is fully computed server-side (lib/prescriptions/dur.ts)
// — this screen only displays whatever warnings come back, it never runs
// interaction-checking logic itself. A "severe" finding returns 409 with
// requiresConfirmation; resubmitting with confirm:true (the same request,
// unchanged) proceeds anyway, exactly like web's confirmation dialog.

interface DrugItem { drug_name: string; dose: string; frequency: string; duration: string; quantity: string; instructions: string }
interface Warning { severity: "severe" | "moderate" | "minor" | string; message: string }
interface PrescriptionRow {
  id: string
  status: string
  created_at: string
  diagnosis: string | null
  customer: { full_name: string; phone: string | null } | null
  items: { drug_name: string }[]
}

const EMPTY_ITEM: DrugItem = { drug_name: "", dose: "", frequency: "", duration: "", quantity: "", instructions: "" }

export default function Prescriptions() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const [list, setList] = useState<PrescriptionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [prescriberName, setPrescriberName] = useState("")
  const [diagnosis, setDiagnosis] = useState("")
  const [items, setItems] = useState<DrugItem[]>([{ ...EMPTY_ITEM }])
  const [warnings, setWarnings] = useState<Warning[] | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        setList((await listLocalPrescriptions()).prescriptions)
        return
      }
      const res = await apiFetch("/api/prescriptions")
      const json = (await res.json()) as { prescriptions: PrescriptionRow[]; error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to load")
      setList(json.prescriptions)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load prescriptions")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [])

  function resetForm() {
    setCustomerName(""); setCustomerPhone(""); setPrescriberName(""); setDiagnosis("")
    setItems([{ ...EMPTY_ITEM }]); setWarnings(null)
  }

  function updateItem(i: number, patch: Partial<DrugItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  async function submit(confirm = false) {
    if (!customerName.trim()) { toast.error("Patient name is required"); return }
    const validItems = items.filter((it) => it.drug_name.trim())
    if (validItems.length === 0) { toast.error("Add at least one drug"); return }

    setSubmitting(true)
    try {
      const itemsPayload = validItems.map((it) => ({
        drug_name: it.drug_name.trim(),
        dose: it.dose.trim() || undefined,
        frequency: it.frequency.trim() || undefined,
        duration: it.duration.trim() || undefined,
        quantity: it.quantity.trim() ? parseInt(it.quantity, 10) : undefined,
        instructions: it.instructions.trim() || undefined,
      }))
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        const result = await createLocalPrescription({
          customerName: customerName.trim(), customerPhone: customerPhone.trim() || null,
          prescriberName: prescriberName.trim() || null, diagnosis: diagnosis.trim() || null,
          items: itemsPayload, confirm,
        })
        if (result.requiresConfirmation) {
          setWarnings(result.warnings)
          return
        }
        toast.success("Prescription saved")
        setShowForm(false)
        resetForm()
        await load()
        return
      }
      const res = await apiFetch("/api/prescriptions", {
        method: "POST",
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || undefined,
          prescriber_name: prescriberName.trim() || undefined,
          diagnosis: diagnosis.trim() || undefined,
          items: itemsPayload,
          confirm,
        }),
      })
      const json = (await res.json()) as { error?: string; warnings?: Warning[]; requiresConfirmation?: boolean }
      if (res.status === 409 && json.requiresConfirmation) {
        setWarnings(json.warnings ?? [])
        return
      }
      if (!res.ok) throw new Error(json.error ?? "Could not save prescription")
      toast.success("Prescription saved")
      setShowForm(false)
      resetForm()
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Prescriptions" />

      {showForm ? (
        <Card style={styles.formCard}>
          <Text style={styles.formTitle}>New prescription</Text>
          <TextInput style={styles.input} placeholder="Patient name" placeholderTextColor={theme.textTertiary} value={customerName} onChangeText={setCustomerName} />
          <TextInput style={styles.input} placeholder="Patient phone (optional)" placeholderTextColor={theme.textTertiary} keyboardType="phone-pad" value={customerPhone} onChangeText={setCustomerPhone} />
          <TextInput style={styles.input} placeholder="Prescriber name (optional)" placeholderTextColor={theme.textTertiary} value={prescriberName} onChangeText={setPrescriberName} />
          <TextInput style={styles.input} placeholder="Diagnosis (optional)" placeholderTextColor={theme.textTertiary} value={diagnosis} onChangeText={setDiagnosis} />

          <Text style={styles.sectionLabel}>Drugs</Text>
          {items.map((item, i) => (
            <View key={i} style={styles.itemBlock}>
              <View style={styles.itemRow}>
                <TextInput style={[styles.input, styles.itemInput]} placeholder="Drug name" placeholderTextColor={theme.textTertiary} value={item.drug_name} onChangeText={(v) => updateItem(i, { drug_name: v })} />
                {items.length > 1 && (
                  <Pressable onPress={() => setItems((prev) => prev.filter((_, idx) => idx !== i))} hitSlop={8} style={styles.removeButton}>
                    <Ionicons name="close-circle-outline" size={20} color={theme.red} />
                  </Pressable>
                )}
              </View>
              <View style={styles.itemRow}>
                <TextInput style={[styles.input, styles.itemInputSmall]} placeholder="Dose" placeholderTextColor={theme.textTertiary} value={item.dose} onChangeText={(v) => updateItem(i, { dose: v })} />
                <TextInput style={[styles.input, styles.itemInputSmall]} placeholder="Frequency" placeholderTextColor={theme.textTertiary} value={item.frequency} onChangeText={(v) => updateItem(i, { frequency: v })} />
                <TextInput style={[styles.input, styles.itemInputSmall]} placeholder="Duration" placeholderTextColor={theme.textTertiary} value={item.duration} onChangeText={(v) => updateItem(i, { duration: v })} />
              </View>
            </View>
          ))}
          <Button title="Add another drug" variant="secondary" onPress={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])} />

          {warnings && warnings.length > 0 && (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>Safety warnings</Text>
              {warnings.map((w, i) => (
                <Text key={i} style={styles.warningText}>• {w.message} ({w.severity})</Text>
              ))}
              <Button title="Proceed anyway" variant="danger" onPress={() => submit(true)} loading={submitting} />
            </View>
          )}

          <View style={styles.formActions}>
            <Button title="Save prescription" onPress={() => submit(false)} loading={submitting} style={styles.formButton} />
            <Button title="Cancel" variant="secondary" onPress={() => { setShowForm(false); resetForm() }} style={styles.formButton} />
          </View>
        </Card>
      ) : (
        <Button title="New prescription" onPress={() => setShowForm(true)} icon={<Ionicons name="add-circle-outline" size={18} color="#fff" />} style={styles.newButton} />
      )}

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={theme.green} /></View>
      ) : !showForm ? (
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon={<Ionicons name="document-text-outline" size={32} color={theme.textTertiary} />} message="No prescriptions yet" />}
          renderItem={({ item }) => (
            <Card style={styles.row}>
              <Text style={styles.rowName}>{item.customer?.full_name ?? "Unknown patient"}</Text>
              <Text style={styles.rowMeta}>{item.items.map((it) => it.drug_name).join(", ")}</Text>
              <Text style={styles.rowDate}>{new Date(item.created_at).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}</Text>
            </Card>
          )}
        />
      ) : null}
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    newButton: { marginBottom: 12 },
    formCard: { gap: 10, marginBottom: 12 },
    formTitle: { fontSize: 15, fontWeight: "700", color: theme.text },
    sectionLabel: { fontSize: 12, fontWeight: "700", color: theme.textSecondary, textTransform: "uppercase", marginTop: 4 },
    input: {
      borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12,
      fontSize: 15, backgroundColor: theme.surface, color: theme.text,
    },
    itemBlock: { gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.border },
    itemRow: { flexDirection: "row", gap: 6, alignItems: "center" },
    itemInput: { flex: 1 },
    itemInputSmall: { flex: 1 },
    removeButton: { padding: 2 },
    formActions: { flexDirection: "row", gap: 8, marginTop: 4 },
    formButton: { flex: 1 },
    warningBox: { gap: 6, borderRadius: 8, borderWidth: 1, borderColor: theme.red, backgroundColor: theme.red50, padding: 10 },
    warningTitle: { fontSize: 13, fontWeight: "700", color: theme.red },
    warningText: { fontSize: 12, color: theme.red },
    list: { gap: 8, paddingBottom: 24 },
    row: { gap: 2 },
    rowName: { fontSize: 14, fontWeight: "700", color: theme.text },
    rowMeta: { fontSize: 12, color: theme.textSecondary },
    rowDate: { fontSize: 11, color: theme.textTertiary },
  })
}
