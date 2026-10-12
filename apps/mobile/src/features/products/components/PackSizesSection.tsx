import Ionicons from "@expo/vector-icons/Ionicons"
import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { Button, Card, IconButton, ListRow, Money, StatusBadge, Text } from "../../../components"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { priceCents } from "../logic/form"
import { plural } from "../logic/units"
import type { PackSize } from "../types"
import { PackSizeSheet } from "./PackSizeSheet"

interface PackSizesSectionProps {
  productId: string
  productName: string
  baseUnit: string
  packSizes: PackSize[]
  canEdit: boolean
  onChange: (next: PackSize[]) => void
  onPrint: (label: { code: string; productName: string; price: number }) => void
}

export function PackSizesSection({ productId, productName, baseUnit, packSizes, canEdit, onChange, onPrint }: PackSizesSectionProps) {
  const theme = useTheme()
  const [editing, setEditing] = useState<PackSize | null>(null)
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(0)
  const sorted = [...packSizes].sort((a, b) => a.units_per_pack - b.units_per_pack)

  function openSheet(p: PackSize | null) {
    setEditing(p)
    setSession((n) => n + 1)
    setOpen(true)
  }

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text variant="headline" style={styles.flex} accessibilityRole="header">
          Pack sizes
        </Text>
        {canEdit ? (
          <Button title="Add" size="sm" variant="secondary" onPress={() => openSheet(null)} leadingIcon={<Ionicons name="add" size={18} color={theme.text} />} accessibilityLabel="Add a pack size" />
        ) : null}
      </View>
      {sorted.length === 0 ? (
        <Text tone="secondary">No pack sizes yet — it sells per {baseUnit}.</Text>
      ) : (
        sorted.map((p) => {
          const cents = priceCents(p.selling_price)
          return (
            <ListRow
              key={p.id}
              title={p.pack_label}
              subtitle={`${p.units_per_pack} ${plural(baseUnit)}${p.barcode ? ` · ${p.barcode}` : ""}`}
              onPress={canEdit ? () => openSheet(p) : undefined}
              style={styles.row}
              accessibilityHint={canEdit ? "Edit this pack size" : undefined}
              meta={!p.is_active ? <StatusBadge status="neutral" label="Not sold" /> : null}
              trailing={
                <View style={styles.trailing}>
                  {cents != null ? <Money cents={cents} /> : null}
                  {p.barcode ? (
                    <IconButton
                      icon="pricetag-outline"
                      accessibilityLabel={`Print barcode label for ${p.pack_label}`}
                      onPress={() => onPrint({ code: p.barcode!, productName: `${productName} — ${p.pack_label}`, price: p.selling_price })}
                    />
                  ) : null}
                </View>
              }
            />
          )
        })
      )}
      <PackSizeSheet
        key={session}
        open={open}
        productId={productId}
        baseUnit={baseUnit}
        packSize={editing}
        onClose={() => setOpen(false)}
        onSaved={(saved) => onChange(packSizes.some((p) => p.id === saved.id) ? packSizes.map((p) => (p.id === saved.id ? saved : p)) : [...packSizes, saved])}
        onDeleted={(id) => onChange(packSizes.filter((p) => p.id !== id))}
      />
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
  row: { paddingHorizontal: 0 },
  trailing: { flexDirection: "row", alignItems: "center", gap: space.xs },
})
