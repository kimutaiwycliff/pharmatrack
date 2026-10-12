import type { ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import { Card, IconButton, Text } from "../../../components"
import { space } from "../../../theme/tokens"

interface SectionProps {
  title: string
  subtitle?: string | null
  /** Shows a share button that exports this table as CSV. Without children the
   *  section is just a header (e.g. above a FlashList's rows). */
  onShareCsv?: () => void
  /** Wrap children in a Card (default) or render them bare. */
  card?: boolean
  /** Card without inner padding (for edge-to-edge ListRows). */
  flush?: boolean
  children?: ReactNode
}

// A titled block on the Dashboard / Reports. Tables get a CSV share button in
// the header, like the "CSV" button on each table of the web reports page.
export function Section({ title, subtitle, onShareCsv, card = true, flush, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <Text variant="headline" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" tone="secondary">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {onShareCsv ? (
          <IconButton icon="share-outline" onPress={onShareCsv} accessibilityLabel={`Export ${title} as CSV`} variant="tonal" size={20} />
        ) : null}
      </View>
      {children == null ? null : card ? <Card style={flush ? styles.flush : null}>{children}</Card> : children}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48 },
  titles: { flex: 1 },
  flush: { padding: 0, overflow: "hidden" },
})
