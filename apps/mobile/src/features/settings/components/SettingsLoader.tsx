import type { ReactNode } from "react"
import { ErrorState, NeedsInternet, Screen, ScreenHeader, SkeletonBlock } from "../../../components"
import { StyleSheet, View } from "react-native"
import { space } from "../../../theme/tokens"
import { useSettingsData, type SettingsData } from "../data"

// Shared shell for the Settings sub-screens: header, then a form-shaped
// skeleton while loading, ErrorState + Retry on failure, NeedsInternet in the
// online build without a connection — and the form once data is in. The form
// is rendered as a child component so its fields can be seeded from the
// loaded data with useState initialisers (no effect copying data into state).
export function SettingsLoader({
  title,
  feature,
  children,
}: {
  title: string
  /** For NeedsInternet, e.g. "Your profile". */
  feature: string
  children: (data: SettingsData, update: (patch: Partial<SettingsData>) => void) => ReactNode
}) {
  const q = useSettingsData()
  let body: ReactNode
  if (q.needsInternet) body = <NeedsInternet feature={feature} />
  else if (q.error && !q.data) body = <ErrorState message={q.error} onRetry={q.retry} />
  else if (!q.data) body = <FormSkeleton />
  else body = children(q.data, (patch) => q.setData((prev) => (prev ? { ...prev, ...patch } : prev)))
  return (
    <Screen>
      <ScreenHeader title={title} />
      {body}
    </Screen>
  )
}

function FormSkeleton() {
  return (
    <View style={styles.skeleton} accessible accessibilityRole="progressbar" accessibilityLabel="Loading">
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.field}>
          <SkeletonBlock width="30%" height={12} />
          <SkeletonBlock height={48} />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  skeleton: { gap: space.lg },
  field: { gap: space.xs },
})
