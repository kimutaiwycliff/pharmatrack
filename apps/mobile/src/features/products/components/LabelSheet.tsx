import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { Button, QuantityStepper, Sheet, Text } from "../../../components"
import { printLabel, shareLabelPDF, type LabelInput } from "../../../lib/labels/printLabel"
import { toast } from "../../../lib/toast"
import { space } from "../../../theme/tokens"

// Barcode label printing for a product or one of its pack sizes (web's
// LabelPrintDialog): print through the Android print sheet, or save a PDF —
// printAsync can't tell us whether a printer was actually there.
export function LabelSheet({ label, onClose }: { label: Omit<LabelInput, "copies"> | null; onClose: () => void }) {
  const [copies, setCopies] = useState(1)
  const [busy, setBusy] = useState<null | "print" | "pdf">(null)

  async function run(kind: "print" | "pdf") {
    if (!label) return
    setBusy(kind)
    try {
      if (kind === "print") await printLabel({ ...label, copies })
      else await shareLabelPDF({ ...label, copies })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not print the label")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet open={label !== null} onClose={onClose} title="Print barcode label">
      {label ? (
        <>
          <View style={styles.info}>
            <Text variant="bodyStrong">{label.productName}</Text>
            <Text variant="caption" tone="secondary">
              {label.code}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.flex}>Copies</Text>
            <QuantityStepper value={copies} onChange={setCopies} min={1} max={100} unitLabel="label" />
          </View>
          <View style={styles.row}>
            <Button title="Save PDF" variant="secondary" onPress={() => run("pdf")} loading={busy === "pdf"} disabled={busy !== null} style={styles.flex} />
            <Button title="Print" onPress={() => run("print")} loading={busy === "print"} disabled={busy !== null} style={styles.flex} />
          </View>
        </>
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  info: { gap: space.xxs },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  flex: { flex: 1 },
})
