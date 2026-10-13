import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { Button, Chip, Sheet, Text, TextField } from "../../../components"
import { apiJson, errorMessage } from "../../../lib/api"
import { env } from "../../../lib/env"
import { toast } from "../../../lib/toast"
import { adjustLocalStock } from "../../../repo/inventory"
import { space } from "../../../theme/tokens"
import { ADJUST_REASONS, REASON_CONFIG, defaultQuantityText, planAdjustment, type AdjustReason } from "../logic/adjust"
import type { Batch } from "../logic/types"
import { confirm as askConfirm } from "../../../lib/confirm"

interface AdjustStockSheetProps {
  /** The batch being adjusted; kept while the sheet animates closed. */
  batch: Batch | null
  open: boolean
  onClose: () => void
  /** After a successful save (reload the batches). */
  onSaved: () => void
}

// Correct one batch's quantity with a reason — mirrors web's BatchesSheet
// AdjustPanel and POST /api/inventory/adjust (logic/adjust.ts has the rules).
// The Offline Edition writes the same change through repo/inventory.ts's
// adjustLocalStock (delta + reason + note, with an audit row).
export function AdjustStockSheet({ batch, open, onClose, onSaved }: AdjustStockSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Adjust stock" scrollable>
      {batch ? <AdjustForm key={batch.id} batch={batch} onClose={onClose} onSaved={onSaved} /> : null}
    </Sheet>
  )
}

function AdjustForm({ batch, onClose, onSaved }: { batch: Batch; onClose: () => void; onSaved: () => void }) {
  const remaining = batch.quantity_remaining
  const [reason, setReason] = useState<AdjustReason>("count_correction")
  const [qty, setQty] = useState(() => defaultQuantityText("count_correction", remaining))
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const cfg = REASON_CONFIG[reason]
  const plan = planAdjustment(remaining, reason, qty)

  function pickReason(r: AdjustReason) {
    setReason(r)
    setQty(defaultQuantityText(r, remaining))
  }

  async function save() {
    if (!plan.valid || !plan.body) return
    setSaving(true)
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        await adjustLocalStock({ batchId: batch.id, delta: plan.delta, reason, note: note.trim() || null })
      } else {
        await apiJson("/api/inventory/adjust", {
          method: "POST",
          body: { batch_id: batch.id, ...plan.body, note: note.trim() || undefined },
        })
      }
      toast.success("Stock adjusted")
      onSaved()
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't adjust the stock. Please try again."))
    } finally {
      setSaving(false)
    }
  }

  // Returned to the Save button, which stays locked through confirm + save.
  async function confirm() {
    if (!plan.valid) return
    const change = plan.delta > 0 ? `+${plan.delta}` : String(plan.delta)
    const ok = await askConfirm({
      title: "Save adjustment?",
      message: `Batch ${batch.batch_number}: ${remaining} → ${plan.newRemaining} (${change}) — ${cfg.label}.`,
      confirmLabel: "Save",
    })
    if (ok) await save()
  }

  return (
    <View style={styles.form}>
      <Text tone="secondary">
        Batch <Text variant="bodyStrong">{batch.batch_number}</Text> · {remaining.toLocaleString("en-KE")} left
        {batch.branch_name ? ` · ${batch.branch_name}` : ""}
      </Text>

      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel="Reason">
        <Text variant="label" tone="secondary">
          Reason
        </Text>
        <View style={styles.chips}>
          {ADJUST_REASONS.map((r) => (
            <Chip key={r} label={REASON_CONFIG[r].label} selected={reason === r} onPress={() => pickReason(r)} />
          ))}
        </View>
      </View>

      <TextField
        inSheet
        label={cfg.verb}
        value={qty}
        onChangeText={setQty}
        keyboardType="number-pad"
        error={plan.error}
        helper={plan.newRemaining != null && plan.newRemaining >= 0 ? `New quantity for this batch: ${remaining} → ${plan.newRemaining}` : "Quantities are in base units (tablets, ml…)"}
      />

      <TextField
        inSheet
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="e.g. damaged in transit, stocktake on 12 Jun"
        maxLength={500}
      />

      <View style={styles.actions}>
        <Button title="Cancel" variant="secondary" onPress={onClose} disabled={saving} style={styles.flex} />
        <Button title="Save adjustment" onPress={confirm} loading={saving} disabled={!plan.valid} style={styles.flex} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  group: { gap: space.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
  flex: { flex: 1 },
})
