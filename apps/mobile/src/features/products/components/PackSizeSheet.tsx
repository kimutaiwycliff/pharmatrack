import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { Button, IconButton, Sheet, Text, TextField } from "../../../components"
import { useIsOnline } from "../../../components/NeedsInternet"
import { errorMessage } from "../../../lib/api"
import { env } from "../../../lib/env"
import { captureScan } from "../../../lib/scanCapture"
import { scanFields } from "../../../lib/stock/scan-fields"
import { toast } from "../../../lib/toast"
import { space } from "../../../theme/tokens"
import { addPackSize, deletePackSize, setPackSizeActive, updatePackSize } from "../data"
import { EMPTY_PACK_SIZE, packSizeValues, plural, validatePackSize, type PackSizeErrors, type PackSizeValues } from "../logic/units"
import type { PackSize } from "../types"
import { ToggleRow } from "./ToggleRow"
import { confirm as askConfirm } from "../../../lib/confirm"

interface PackSizeSheetProps {
  open: boolean
  productId: string
  baseUnit: string
  /** null = add a new pack size. */
  packSize: PackSize | null
  onClose: () => void
  onSaved: (p: PackSize) => void
  onDeleted: (id: string) => void
}

// Add / edit one pack size (web EditProductSheet's PackSizesEditor): label,
// how many base units it holds, its own price and barcode (scan or type;
// blank lets the server generate an internal one). The parent re-keys it each
// time it opens, so the fields always start from that row's values.
export function PackSizeSheet({ open, productId, baseUnit, packSize, onClose, onSaved, onDeleted }: PackSizeSheetProps) {
  const online = useIsOnline()
  const [values, setValues] = useState<PackSizeValues>(packSize ? packSizeValues(packSize) : EMPTY_PACK_SIZE)
  const [errors, setErrors] = useState<PackSizeErrors>({})
  const [busy, setBusy] = useState<null | "save" | "delete" | "active">(null)

  function set<K extends keyof PackSizeValues>(k: K, v: string) {
    setValues((s) => ({ ...s, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }))
  }

  async function scan() {
    const code = await captureScan()
    if (!code) return
    const f = scanFields(code)
    set("barcode", f.gtin ?? f.raw)
  }

  async function save() {
    const r = validatePackSize(values, baseUnit)
    if (!r.ok) {
      setErrors(r.errors)
      return
    }
    setBusy("save")
    try {
      const saved = packSize ? await updatePackSize(productId, packSize.id, r.body) : await addPackSize(productId, r.body)
      toast.success(packSize ? "Pack size updated" : "Pack size added")
      onSaved(saved)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function toggleActive() {
    if (!packSize) return
    setBusy("active")
    try {
      const saved = await setPackSizeActive(productId, packSize.id, !packSize.is_active)
      onSaved(saved)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function confirmDelete() {
    if (!packSize) return
    const ok = await askConfirm({
      title: "Remove pack size",
      message: `Remove “${packSize.pack_label}”? Sales already made keep their receipts.`,
      confirmLabel: "Remove",
      destructive: true,
    })
    if (!ok) return
    setBusy("delete")
    try {
      await deletePackSize(productId, packSize.id)
      toast.success("Pack size removed")
      onDeleted(packSize.id)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={packSize ? "Edit pack size" : "Add pack size"}
      snapPoints={["85%"]}
      scrollable
      footer={<Button title={packSize ? "Save pack size" : "Add pack size"} onPress={save} loading={busy === "save"} disabled={busy !== null} />}
    >
      <TextField label="Pack name" placeholder="e.g. Strip of 10" value={values.pack_label} onChangeText={(v) => set("pack_label", v)} error={errors.pack_label} inSheet />
      <View style={styles.row}>
        <TextField
          label={`${plural(baseUnit) || "Units"} per pack`}
          placeholder="e.g. 10"
          keyboardType="number-pad"
          value={values.units_per_pack}
          onChangeText={(v) => set("units_per_pack", v)}
          error={errors.units_per_pack}
          containerStyle={styles.flex}
          inSheet
        />
        <TextField
          label="Selling price (KES)"
          placeholder="0.00"
          keyboardType="decimal-pad"
          value={values.selling_price}
          onChangeText={(v) => set("selling_price", v)}
          error={errors.selling_price}
          containerStyle={styles.flex}
          inSheet
        />
      </View>
      <TextField
        label="Barcode"
        placeholder="Scan or type — optional"
        helper={env.EXPO_PUBLIC_OFFLINE_MODE ? undefined : "Leave blank and PharmaTrack makes a printable one"}
        autoCapitalize="none"
        value={values.barcode}
        onChangeText={(v) => set("barcode", v)}
        trailing={<IconButton icon="barcode-outline" accessibilityLabel="Scan the pack's barcode" onPress={scan} />}
        inSheet
      />
      {packSize && !env.EXPO_PUBLIC_OFFLINE_MODE && online ? (
        <ToggleRow
          label="Sold at the till"
          description="Turn off to stop offering this pack size without deleting it"
          value={packSize.is_active}
          onChange={toggleActive}
          disabled={busy !== null}
        />
      ) : null}
      {packSize ? (
        <Button title="Remove pack size" variant="ghost" onPress={confirmDelete} loading={busy === "delete"} disabled={busy !== null} />
      ) : (
        <Text variant="caption" tone="secondary">
          Each pack size sells at its own price. Stock is always counted in {plural(baseUnit) || "base units"}.
        </Text>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.md },
  flex: { flex: 1 },
})
