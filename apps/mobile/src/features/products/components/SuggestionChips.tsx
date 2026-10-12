import { ScrollView, StyleSheet } from "react-native"
import { Chip } from "../../../components"
import { space } from "../../../theme/tokens"

// Tap-to-fill suggestions under a free-text field (web's SuggestInput
// dropdown): curated values plus ones teammates already used.
export function SuggestionChips({ options, onPick, label }: { options: string[]; onPick: (v: string) => void; label: string }) {
  if (options.length === 0) return null
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.row}>
      {options.map((o) => (
        <Chip key={o} label={o} onPress={() => onPick(o)} accessibilityLabel={`${label}: ${o}`} />
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingVertical: space.xxs },
})
