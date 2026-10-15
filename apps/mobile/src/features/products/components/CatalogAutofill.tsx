import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, View } from "react-native"
import { Card, ListRow, StatusBadge, Text, TextField } from "../../../components"
import { useQuery } from "../../../hooks/useQuery"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { searchCatalog } from "../data"
import type { CatalogItem } from "../types"

// "Quick start from catalog" (web NewProductDialog): search the shared drug
// catalogue (GET /api/catalog; the bundled KEML list in the Offline Edition)
// and prefill name, strength, form, unit and the Rx/controlled flags.
export function CatalogAutofill({ onPick }: { onPick: (item: CatalogItem) => void }) {
  const theme = useTheme()
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  const results = useQuery(debounced ? `catalog:${debounced}` : null, () => searchCatalog(debounced))
  const items = debounced && query.trim() ? (results.data ?? []) : []

  function pick(item: CatalogItem) {
    onPick(item)
    setPicked(`${item.name}${item.strength ? ` ${item.strength}` : ""}`)
    setQuery("")
  }

  return (
    <Card style={[styles.card, { backgroundColor: theme.green50, borderColor: theme.green100 }]}>
      <View style={styles.head}>
        <Ionicons name="sparkles-outline" size={16} color={theme.green600} />
        <Text variant="label" tone="success">
          Quick start from catalog
        </Text>
      </View>
      <TextField
        label="Search the drug catalog"
        hideLabel
        placeholder="e.g. Paracetamol, Amoxil, Amlodipine…"
        value={query}
        onChangeText={(v) => {
          setQuery(v)
          setPicked(null)
        }}
        autoCorrect={false}
        leading={<Ionicons name="search" size={18} color={theme.textTertiary} />}
        trailing={results.loading ? <ActivityIndicator color={theme.green} /> : null}
      />
      {items.length > 0 ? (
        <View style={[styles.results, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          {items.map((item) => (
            <ListRow
              key={item.id}
              title={`${item.name}${item.strength ? ` ${item.strength}` : ""}`}
              subtitle={[item.dosage_form, item.generic_name ?? item.brand_name, `per ${item.base_unit}`, item.ppb_registration_no ? `PPB ${item.ppb_registration_no}` : null].filter(Boolean).join(" · ")}
              onPress={() => pick(item)}
              accessibilityHint="Fills in this product's details"
              meta={
                item.requires_prescription || item.is_controlled ? (
                  <View style={styles.badges}>
                    {item.requires_prescription ? <StatusBadge status="neutral" label="Rx" /> : null}
                    {item.is_controlled ? <StatusBadge status="warning" label="Controlled" /> : null}
                  </View>
                ) : null
              }
            />
          ))}
        </View>
      ) : debounced && query.trim() && results.data && !results.loading ? (
        <Text variant="caption" tone="secondary">
          Nothing in the catalog matches “{debounced}” — fill the details in below.
        </Text>
      ) : null}
      {results.error ? (
        <Text variant="caption" tone="danger">
          {results.error}
        </Text>
      ) : null}
      {picked ? (
        <Text variant="caption" tone="success" accessibilityLiveRegion="polite">
          Autofilled {picked} — just set the price below.
        </Text>
      ) : !items.length ? (
        <Text variant="caption" tone="secondary">
          Pick a product to autofill its details, or type everything manually below.
        </Text>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.xs },
  results: { borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  badges: { flexDirection: "row", gap: space.xs, marginTop: space.xxs },
})
