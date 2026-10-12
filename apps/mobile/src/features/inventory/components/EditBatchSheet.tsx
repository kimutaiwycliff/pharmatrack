import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { Button, DateField, Sheet, TextField } from "../../../components"
import { apiJson, errorMessage } from "../../../lib/api"
import { parseISODate, toISODate } from "../../../lib/dates"
import { parseAmount } from "../../../lib/stock/units"
import { toast } from "../../../lib/toast"
import { space } from "../../../theme/tokens"
import type { Batch } from "../logic/types"

interface EditBatchSheetProps {
  batch: Batch | null
  open: boolean
  canSeeCost: boolean
  onClose: () => void
  onSaved: () => void
}

// Fix a batch's details (expiry, batch number, cost per unit) — mirrors web's
// BatchesSheet EditBatchPanel and PATCH /api/batches (id + only the changed
// fields; quantity changes go through Adjust stock for the audit trail).
// Online only: the Offline Edition's repo has no batch update.
export function EditBatchSheet({ batch, open, canSeeCost, onClose, onSaved }: EditBatchSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Edit batch" scrollable>
      {batch ? <EditForm key={batch.id} batch={batch} canSeeCost={canSeeCost} onClose={onClose} onSaved={onSaved} /> : null}
    </Sheet>
  )
}

function EditForm({ batch, canSeeCost, onClose, onSaved }: { batch: Batch; canSeeCost: boolean; onClose: () => void; onSaved: () => void }) {
  const origExpiry = (batch.expiry_date ?? "").slice(0, 10)
  const origCost = batch.cost_price != null && batch.cost_price !== "" ? Number(batch.cost_price) : null
  const [expiry, setExpiry] = useState(origExpiry)
  const [batchNo, setBatchNo] = useState(batch.batch_number ?? "")
  const [cost, setCost] = useState(origCost != null ? String(origCost) : "")
  const [saving, setSaving] = useState(false)

  const costValue = cost.trim() === "" ? null : parseAmount(cost)
  const costError = cost.trim() !== "" && costValue == null ? "Enter a valid amount" : null
  const batchError = batchNo.trim() ? null : "Batch number can't be empty"

  async function save() {
    if (costError || batchError) return
    const body: Record<string, unknown> = { id: batch.id }
    if (expiry && expiry !== origExpiry) body.expiry_date = expiry
    if (batchNo.trim() !== batch.batch_number) body.batch_number = batchNo.trim()
    if (canSeeCost && costValue !== origCost) body.cost_price = costValue
    if (Object.keys(body).length === 1) {
      onClose()
      return
    }
    setSaving(true)
    try {
      await apiJson("/api/batches", { method: "PATCH", body })
      toast.success("Batch updated")
      onSaved()
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.form}>
      <TextField inSheet label="Batch number" value={batchNo} onChangeText={setBatchNo} autoCapitalize="characters" autoCorrect={false} error={batchError} />
      <DateField label="Expiry date" value={parseISODate(expiry)} onChange={(d) => setExpiry(toISODate(d))} />
      {canSeeCost ? (
        <TextField
          inSheet
          label="Cost per unit (KES, optional)"
          value={cost}
          onChangeText={setCost}
          keyboardType="decimal-pad"
          placeholder="—"
          error={costError}
          helper="Per base unit (tablet, ml…), not per pack"
        />
      ) : null}
      <View style={styles.actions}>
        <Button title="Cancel" variant="secondary" onPress={onClose} disabled={saving} style={styles.flex} />
        <Button title="Save changes" onPress={() => void save()} loading={saving} disabled={!!costError || !!batchError} style={styles.flex} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
  flex: { flex: 1 },
})
