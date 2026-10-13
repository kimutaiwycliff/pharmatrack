import Ionicons from "@expo/vector-icons/Ionicons"
import { router } from "expo-router"
import { useMemo, useState } from "react"
import { StyleSheet, View } from "react-native"
import {
  Button, EmptyState, FormScroll, IconButton, NeedsInternet, Screen, ScreenHeader, Text, TextField, useIsOnline,
} from "../../src/components"
import { CustomerFields, type CustomerValue } from "../../src/features/clinical/components/CustomerFields"
import { DurWarnings } from "../../src/features/clinical/components/DurWarnings"
import { ProductPickerSheet } from "../../src/features/clinical/components/ProductPickerSheet"
import { createPrescription, fetchCustomerClinical } from "../../src/features/clinical/data"
import { drugLabel, emptyLine, previewDur, validatePrescription, type DrugLine } from "../../src/features/clinical/logic/prescriptions"
import { useClinicalDirty } from "../../src/features/clinical/store"
import type { DurFinding } from "../../src/features/clinical/types"
import { useCan } from "../../src/hooks/useCan"
import { useQuery } from "../../src/hooks/useQuery"
import { errorMessage } from "../../src/lib/api"
import { env } from "../../src/lib/env"
import { haptics } from "../../src/lib/haptics"
import { toast } from "../../src/lib/toast"
import { useTheme } from "../../src/theme/useTheme"
import { radius, space } from "../../src/theme/tokens"

// New prescription — mirrors apps/web/components/prescriptions/NewPrescriptionDialog.tsx
// and the createSchema in apps/web/app/api/prescriptions/route.ts. Drugs are
// picked from the catalogue cached on this phone (works offline) or typed.
// A DUR preview runs on-device as lines are added; on save the server runs
// the real check and a severe finding comes back as 409 → "Prescribe anyway"
// resubmits with confirm: true, exactly like web.

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE
const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export default function NewPrescription() {
  const theme = useTheme()
  const can = useCan()
  const online = useIsOnline()
  const reachable = OFFLINE || online

  const [customer, setCustomer] = useState<CustomerValue>({ name: "", phone: "", email: "" })
  const [prescriber, setPrescriber] = useState("")
  const [regNo, setRegNo] = useState("")
  const [diagnosis, setDiagnosis] = useState("")
  const [lines, setLines] = useState<DrugLine[]>(() => [emptyLine(newKey())])
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [serverWarnings, setServerWarnings] = useState<DurFinding[] | null>(null)
  const [saving, setSaving] = useState(false)

  // Allergies + active medication of a picked patient feed the DUR preview.
  const clinical = useQuery(customer.customerId ? `cust:${customer.customerId}` : null, (k) => fetchCustomerClinical(k.slice(5)))
  const preview = useMemo(
    () => previewDur(lines.map((l) => l.drug_name), clinical.data?.allergies, clinical.data?.activeDrugs ?? []),
    [lines, clinical.data],
  )

  const v = validatePrescription({ patientName: customer.name, phone: customer.phone, prescriberName: prescriber, prescriberRegNo: regNo, diagnosis, lines })
  const errors = submitted ? v.errors : { lines: {} as typeof v.errors.lines }

  function updateLine(key: string, patch: Partial<DrugLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
    setServerWarnings(null) // changed drugs → the server's verdict no longer applies
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : [emptyLine(newKey())]))
    setServerWarnings(null)
  }

  async function save(confirm: boolean) {
    setSubmitted(true)
    if (!v.valid) {
      haptics.error()
      return
    }
    setSaving(true)
    try {
      const res = await createPrescription(
        {
          customer_id: customer.customerId,
          customer_name: customer.name.trim(),
          customer_phone: customer.phone.trim() || undefined,
          prescriber_name: prescriber.trim() || undefined,
          prescriber_reg_no: regNo.trim() || undefined,
          diagnosis: diagnosis.trim() || undefined,
          items: v.items,
        },
        confirm,
      )
      if (res.kind === "confirm") {
        haptics.warning()
        setServerWarnings(res.warnings)
        return
      }
      haptics.success()
      if (res.warnings.length > 0) toast.info(`Prescribed with ${res.warnings.length} advisory warning${res.warnings.length === 1 ? "" : "s"}`)
      else toast.success("Prescription saved")
      useClinicalDirty.getState().mark("prescriptions")
      router.back()
    } catch (err) {
      haptics.error()
      toast.error(errorMessage(err, "Couldn't save the prescription. Please try again."))
    } finally {
      setSaving(false)
    }
  }

  if (!can("prescriptions.manage")) {
    return (
      <Screen>
        <ScreenHeader title="New prescription" />
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={32} color={theme.textTertiary} />}
          message="You don't have permission to record prescriptions."
        />
      </Screen>
    )
  }

  if (!reachable) {
    return (
      <Screen>
        <ScreenHeader title="New prescription" />
        <NeedsInternet feature="Saving prescriptions" />
      </Screen>
    )
  }

  const needsConfirm = !!serverWarnings && serverWarnings.length > 0
  const footer = (
    <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.bg }]}>
      <Button title="Cancel" variant="secondary" onPress={() => router.back()} style={styles.flex} />
      {needsConfirm ? (
        <Button title="Prescribe anyway" variant="danger" onPress={() => save(true)} loading={saving} style={styles.flex} />
      ) : (
        <Button title="Save prescription" onPress={() => save(false)} loading={saving} style={styles.flex} />
      )}
    </View>
  )

  return (
    <Screen>
      <ScreenHeader title="New prescription" />
      <FormScroll footer={footer}>
        <Text variant="label" tone="secondary" accessibilityRole="header">
          Patient
        </Text>
        <CustomerFields
          nameLabel="Patient name"
          value={customer}
          onChange={(patch) => {
            setCustomer((c) => ({ ...c, ...patch }))
            setServerWarnings(null)
          }}
          onPick={(c) => setCustomer({ customerId: c.id, name: c.full_name, phone: c.phone ?? "", email: c.email ?? "" })}
          errors={{ name: errors.patientName, phone: errors.phone }}
        />
        {clinical.data?.allergies ? (
          <View style={[styles.allergy, { backgroundColor: theme.red50, borderColor: theme.red }]}>
            <Ionicons name="warning-outline" size={18} color={theme.red} />
            <Text tone="danger" style={styles.flex}>
              Allergies on file: {clinical.data.allergies}
            </Text>
          </View>
        ) : null}
        <TextField label="Diagnosis (optional)" value={diagnosis} onChangeText={setDiagnosis} error={errors.diagnosis} />
        <TextField label="Prescriber (optional)" value={prescriber} onChangeText={setPrescriber} placeholder="Dr. …" autoCapitalize="words" error={errors.prescriberName} />
        {/* The Offline Edition's local repo has no column path for the reg. no. yet. */}
        {OFFLINE ? null : (
          <TextField label="Prescriber reg. no. (optional)" value={regNo} onChangeText={setRegNo} autoCapitalize="characters" error={errors.prescriberRegNo} />
        )}

        <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.section}>
          Medications
        </Text>
        {lines.map((l, i) => {
          const le = errors.lines[l.key] ?? {}
          return (
            <View key={l.key} style={[styles.line, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <View style={styles.lineHead}>
                <Text variant="bodyStrong" style={styles.flex}>
                  Drug {i + 1}
                </Text>
                <IconButton icon="trash-outline" variant="danger" accessibilityLabel={`Remove drug ${i + 1}`} onPress={() => removeLine(l.key)} />
              </View>
              <TextField
                label="Drug"
                value={l.drug_name}
                onChangeText={(drug_name) => updateLine(l.key, { drug_name, product_id: null })}
                placeholder="e.g. Amoxicillin 500mg"
                error={le.drug_name}
                helper={l.product_id ? "From your catalogue" : "Pick from the catalogue or type a name"}
                trailing={
                  <IconButton icon="search" accessibilityLabel={`Choose drug ${i + 1} from the catalogue`} onPress={() => setPickerFor(l.key)} />
                }
              />
              <View style={styles.pair}>
                <TextField label="Dose" value={l.dose} onChangeText={(dose) => updateLine(l.key, { dose })} placeholder="1 tab" error={le.dose} containerStyle={styles.flex} />
                <TextField
                  label="Frequency"
                  value={l.frequency}
                  onChangeText={(frequency) => updateLine(l.key, { frequency })}
                  placeholder="TDS"
                  error={le.frequency}
                  containerStyle={styles.flex}
                />
              </View>
              <View style={styles.pair}>
                <TextField
                  label="Duration"
                  value={l.duration}
                  onChangeText={(duration) => updateLine(l.key, { duration })}
                  placeholder="5 days"
                  error={le.duration}
                  containerStyle={styles.flex}
                />
                <TextField
                  label="Quantity"
                  value={l.quantity}
                  onChangeText={(quantity) => updateLine(l.key, { quantity })}
                  keyboardType="number-pad"
                  placeholder="15"
                  error={le.quantity}
                  containerStyle={styles.flex}
                />
              </View>
              <TextField
                label="Instructions (optional)"
                value={l.instructions}
                onChangeText={(instructions) => updateLine(l.key, { instructions })}
                placeholder="After meals"
                error={le.instructions}
              />
            </View>
          )
        })}
        {errors.items ? (
          <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
            {errors.items}
          </Text>
        ) : null}
        <Button
          title="Add another drug"
          variant="secondary"
          onPress={() => setLines((prev) => [...prev, emptyLine(newKey())])}
          leadingIcon={<Ionicons name="add" size={18} color={theme.text} />}
        />

        {needsConfirm ? (
          <DurWarnings
            warnings={serverWarnings}
            title="Review safety warnings"
            subtitle="The interaction check found a severe problem. Change the drugs, or prescribe anyway if you've confirmed it's safe."
          />
        ) : (
          <DurWarnings warnings={preview} title="Safety check" subtitle="Checked on this phone. The full check runs again when you save." />
        )}
      </FormScroll>

      <ProductPickerSheet
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        onPick={(p) => {
          if (pickerFor) updateLine(pickerFor, { drug_name: drugLabel(p.name, p.strength), product_id: OFFLINE ? null : p.productId })
        }}
        onUseText={(text) => {
          if (pickerFor) updateLine(pickerFor, { drug_name: text, product_id: null })
        }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { marginTop: space.sm },
  allergy: { flexDirection: "row", alignItems: "center", gap: space.sm, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  line: { gap: space.md, borderWidth: 1, borderRadius: radius.lg, padding: space.md },
  lineHead: { flexDirection: "row", alignItems: "center" },
  pair: { flexDirection: "row", gap: space.sm },
  footer: { flexDirection: "row", gap: space.sm, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
})
