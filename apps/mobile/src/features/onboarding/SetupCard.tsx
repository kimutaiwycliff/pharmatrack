import { StyleSheet, View } from "react-native"
import { router, type Href } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import type { SetupProgress, SetupStepKey } from "@pharmatrack/core"
import { Button, Card, Text } from "../../components"
import { ProgressBar } from "../../components/Motion"
import { useQuery } from "../../hooks/useQuery"
import { apiJson } from "../../lib/api"
import { useTheme } from "../../theme/useTheme"
import { space } from "../../theme/tokens"

// Setup guide on the phone (ADR-019) — the same progress as the web
// dashboard (/api/onboarding/progress), with each step opening the app's own
// screen. Owners/managers only, until the first sale.

interface GuideData { audience: boolean; hidden?: boolean; progress?: SetupProgress }

const ROUTE: Partial<Record<SetupStepKey, Href>> = {
  products: "/catalog-seed",
  prices: "/(tabs)/products",
  stock: "/receive-stock",
  first_sale: "/(tabs)/pos",
}

export function SetupCard({ refreshSignal }: { refreshSignal?: number }) {
  const theme = useTheme()
  const { data } = useQuery<GuideData>(`/api/onboarding/progress#${refreshSignal ?? 0}`, () => apiJson<GuideData>("/api/onboarding/progress"))
  const p = data?.audience && !data.hidden ? data.progress : undefined
  if (!p || p.ready) return null
  const core = p.steps.filter((s) => s.core)
  const next = core.find((s) => s.key === p.next)
  const route = next ? ROUTE[next.key] : undefined

  return (
    <Card style={styles.card}>
      <Text variant="headline">Get your pharmacy selling</Text>
      <Text tone="secondary">{p.coreDone} of {p.coreTotal} done · about {p.minutesLeft} minutes left</Text>
      <ProgressBar value={p.coreDone / p.coreTotal} accessibilityLabel={`${p.coreDone} of ${p.coreTotal} setup steps done`} style={styles.bar} />
      {core.map((s) => (
        <View key={s.key} style={styles.row}>
          <Ionicons name={s.done ? "checkmark-circle" : "ellipse-outline"} size={18}
            color={s.done || s.key === p.next ? theme.green : theme.textTertiary} />
          <Text tone={s.done ? "secondary" : "default"} style={styles.flex}>{s.title}</Text>
          {s.detail ? <Text variant="caption" tone="tertiary">{s.detail}</Text> : null}
        </View>
      ))}
      {next && (
        <>
          <Text tone="secondary" style={styles.why}>{next.why}</Text>
          {route && <Button title={next.action.label} onPress={() => router.push(route)} />}
        </>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.sm, marginBottom: space.md },
  bar: { marginVertical: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
  why: { marginTop: space.xs },
})
