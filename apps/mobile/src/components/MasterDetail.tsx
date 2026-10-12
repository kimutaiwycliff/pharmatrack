import type { ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import { useTheme } from "../theme/useTheme"
import { space } from "../theme/tokens"
import { EmptyState } from "./EmptyState"

interface MasterDetailProps {
  master: ReactNode
  /** null = nothing selected yet. */
  detail: ReactNode | null
  /** Shown in the detail pane when nothing is selected. */
  placeholder?: { icon: ReactNode; message: string }
  /** Master pane width as a fraction of the screen (default 0.4). */
  masterRatio?: number
}

// R3 tablet layout (width ≥ TABLET_MIN_WIDTH, see hooks/useIsTablet): list on
// the left, the selected item on the right. Phones push a separate route
// instead — screens decide which via useIsTablet().
export function MasterDetail({ master, detail, placeholder, masterRatio = 0.4 }: MasterDetailProps) {
  const theme = useTheme()
  return (
    <View style={styles.row}>
      <View style={[styles.master, { flex: masterRatio, borderRightColor: theme.border }]}>{master}</View>
      <View style={[styles.detail, { flex: 1 - masterRatio }]}>
        {detail ?? (placeholder ? <EmptyState icon={placeholder.icon} message={placeholder.message} /> : null)}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row" },
  master: { borderRightWidth: StyleSheet.hairlineWidth, paddingRight: space.md },
  detail: { paddingLeft: space.lg },
})
