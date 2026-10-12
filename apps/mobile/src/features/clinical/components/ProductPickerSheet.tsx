import Ionicons from "@expo/vector-icons/Ionicons"
import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { EmptyState, IconButton, ListRow, Sheet, StatusBadge, Text, TextField } from "../../../components"
import type { ProductRow } from "../../../db/schema"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { useLocalProductSearch } from "../hooks"

interface ProductPickerSheetProps {
  open: boolean
  onClose: () => void
  onPick: (product: ProductRow) => void
  /** Use what was typed as a free-text drug (not in the catalogue). */
  onUseText: (text: string) => void
}

const SHOWN = 40

// Drug picker for a prescription line. Searches the catalogue cached on this
// phone (features/pos/data.ts searchPosProducts — name, brand, generic,
// strength, barcode), so it works with no connection. A drug the pharmacy
// doesn't stock can still be prescribed by name.
export function ProductPickerSheet({ open, onClose, onPick, onUseText }: ProductPickerSheetProps) {
  const theme = useTheme()
  const [query, setQuery] = useState("")
  const results = useLocalProductSearch(query, open)
  const typed = query.trim()

  function close() {
    setQuery("")
    onClose()
  }

  return (
    <Sheet open={open} onClose={close} title="Choose a drug" snapPoints={["90%"]} scrollable>
      <TextField
        label="Search drugs"
        hideLabel
        inSheet
        value={query}
        onChangeText={setQuery}
        placeholder="Name, generic or strength"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        leading={<Ionicons name="search-outline" size={20} color={theme.textTertiary} />}
        trailing={
          query ? <IconButton icon="close-circle" accessibilityLabel="Clear search" color={theme.textTertiary} onPress={() => setQuery("")} /> : null
        }
      />
      {typed ? (
        <ListRow
          title={`Use "${typed}"`}
          subtitle="Not in your catalogue — prescribe by name"
          leading={<Ionicons name="create-outline" size={22} color={theme.textSecondary} />}
          onPress={() => {
            onUseText(typed)
            close()
          }}
          accessibilityLabel={`Prescribe ${typed} by name`}
          style={styles.flush}
        />
      ) : null}
      {results.length === 0 ? (
        <EmptyState
          icon={<Ionicons name="medkit-outline" size={32} color={theme.textTertiary} />}
          message={typed ? `No products match "${typed}"` : "No products on this phone yet — sync first"}
        />
      ) : (
        <View>
          {results.slice(0, SHOWN).map((p) => {
            const detail = [p.genericName && p.genericName !== p.name ? p.genericName : null, p.strength, p.dosageForm].filter(Boolean).join(" · ")
            return (
              <ListRow
                key={p.productId}
                title={p.name}
                subtitle={detail || null}
                trailing={p.requiresPrescription ? <StatusBadge status="warning" label="Rx" /> : null}
                onPress={() => {
                  onPick(p)
                  close()
                }}
                accessibilityLabel={`${p.name}${detail ? `, ${detail}` : ""}${p.requiresPrescription ? ", prescription only" : ""}`}
                style={styles.flush}
              />
            )
          })}
          {results.length > SHOWN ? (
            <Text variant="caption" tone="secondary" align="center" style={styles.more}>
              Showing the first {SHOWN} — type more to narrow it down
            </Text>
          ) : null}
        </View>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  flush: { paddingHorizontal: 0 },
  more: { paddingVertical: space.md },
})
