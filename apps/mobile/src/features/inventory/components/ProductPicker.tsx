import { useState } from "react"
import { ActivityIndicator, StyleSheet, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { ErrorState, IconButton, ListRow, Text, TextField } from "../../../components"
import { useQuery } from "../../../hooks/useQuery"
import { useTheme } from "../../../theme/useTheme"
import { radius, space } from "../../../theme/tokens"
import { searchReceiveProducts } from "../data"
import type { ReceiveProduct } from "../logic/types"
import { useDebouncedValue } from "../useDebouncedValue"

interface ProductPickerProps {
  branchId: string | null
  onPick: (p: ReceiveProduct) => void
  error?: string | null
}

// "Or search by name" from web's StockReceiveForm: type 2+ characters, pick a
// row. Rendered inside the receive form's FormScroll, so results are a plain
// mapped list (≤30 rows from the search route), not a nested virtual list.
export function ProductPicker({ branchId, onPick, error }: ProductPickerProps) {
  const theme = useTheme()
  const [text, setText] = useState("")
  const q = useDebouncedValue(text.trim(), 250)
  const key = q.length >= 2 ? `receive-search:${branchId ?? "-"}:${q}` : null
  const results = useQuery(key, () => searchReceiveProducts(q, branchId))

  return (
    <View style={styles.wrap}>
      <TextField
        label="Product"
        placeholder="Search product name or brand"
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        error={error}
        helper={error ? null : "Or tap Scan to read the pack's barcode"}
        leading={<Ionicons name="search-outline" size={20} color={theme.textTertiary} />}
        trailing={text ? <IconButton icon="close-circle" accessibilityLabel="Clear search" color={theme.textTertiary} onPress={() => setText("")} /> : null}
      />
      {key && results.loading ? <ActivityIndicator color={theme.green} accessibilityLabel="Searching" /> : null}
      {key && results.error ? <ErrorState compact message={results.error} onRetry={results.retry} /> : null}
      {key && results.data ? (
        results.data.length > 0 ? (
          <View style={[styles.results, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            {results.data.map((p) => (
              <ListRow
                key={p.id}
                title={`${p.name}${p.strength ? ` ${p.strength}` : ""}`}
                subtitle={[p.brand_name, p.stock_on_hand != null ? `${p.stock_on_hand} ${p.base_unit ?? "units"} in stock` : null].filter(Boolean).join(" · ") || null}
                onPress={() => {
                  setText("")
                  onPick(p)
                }}
                accessibilityLabel={`Receive ${p.name}${p.strength ? ` ${p.strength}` : ""}`}
                trailing={<Ionicons name="add-circle-outline" size={22} color={theme.green600} />}
              />
            ))}
          </View>
        ) : (
          <Text variant="caption" tone="tertiary">
            No products match &quot;{q}&quot;.
          </Text>
        )
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  results: { borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
})
