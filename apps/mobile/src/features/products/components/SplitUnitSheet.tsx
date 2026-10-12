import { formatKES } from "@pharmatrack/core"
import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { Button, Card, Sheet, Text, TextField } from "../../../components"
import { errorMessage } from "../../../lib/api"
import { toast } from "../../../lib/toast"
import { space } from "../../../theme/tokens"
import { splitUnit } from "../data"
import { plural, validateSplit, type SplitErrors, type SplitValues } from "../logic/units"
import type { ProductDetail } from "../types"

interface SplitUnitSheetProps {
  open: boolean
  product: ProductDetail
  onClose: () => void
  onDone: () => void
}

// "Sell in smaller units" (web EditProductSheet's SplitUnitPanel → POST
// /api/products/[id]/split-unit): re-base a product onto a smaller unit, e.g. a
// strip (KES 50) → 10 capsules (KES 5 each). The server multiplies stock,
// batches, history and pack sizes by the factor and keeps the old unit as a
// pack size at its exact old price. Never offered for controlled products.
// Re-keyed by the parent each time it opens.
export function SplitUnitSheet({ open, product, onClose, onDone }: SplitUnitSheetProps) {
  const [values, setValues] = useState<SplitValues>({ factor: "", unit: "" })
  const [errors, setErrors] = useState<SplitErrors>({})
  const [saving, setSaving] = useState(false)
  const check = validateSplit(values, product)
  const preview = check.ok ? check.preview : null

  function set<K extends keyof SplitValues>(k: K, v: string) {
    setValues((s) => ({ ...s, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }))
  }

  async function apply() {
    if (!check.ok) {
      setErrors(check.errors)
      return
    }
    setSaving(true)
    try {
      await splitUnit(product.id, { new_base_unit: check.preview.unit, factor: check.preview.factor })
      toast.success(`${product.name} now sells per ${check.preview.unit} — the ${product.base_unit} is kept as a pack size`)
      onDone()
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Sell in smaller units"
      snapPoints={["80%"]}
      scrollable
      footer={<Button title="Convert" onPress={apply} loading={saving} />}
    >
      <Text tone="secondary">
        Split each {product.base_unit} into smaller units so you can sell loose (e.g. a strip into capsules). Stock, batches and
        history are converted; the {product.base_unit} stays available as a pack size at its current price.
      </Text>
      <View style={styles.row}>
        <TextField
          label={`Units per ${product.base_unit}`}
          placeholder="e.g. 10"
          keyboardType="number-pad"
          value={values.factor}
          onChangeText={(v) => set("factor", v)}
          error={errors.factor}
          containerStyle={styles.flex}
          inSheet
        />
        <TextField
          label="New unit name"
          placeholder="e.g. capsule"
          autoCapitalize="none"
          value={values.unit}
          onChangeText={(v) => set("unit", v)}
          error={errors.unit}
          containerStyle={styles.flex}
          inSheet
        />
      </View>
      {preview ? (
        <Card>
          <Text accessibilityLiveRegion="polite">
            1 {product.base_unit} = {preview.factor} {plural(preview.unit)} · new price{" "}
            <Text variant="bodyStrong">{formatKES(preview.newPriceCents)}</Text> per {preview.unit}
            {preview.rounded ? " (rounded)" : ""}
          </Text>
        </Card>
      ) : null}
      <Text variant="caption" tone="secondary">
        This needs access to all branches, because every branch&apos;s batches are converted together.
      </Text>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.md },
  flex: { flex: 1 },
})
