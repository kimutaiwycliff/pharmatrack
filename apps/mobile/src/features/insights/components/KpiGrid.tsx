import { StyleSheet, View } from "react-native"
import { Card, Text, type TextTone } from "../../../components"
import { useIsTablet } from "../../../hooks/useIsTablet"
import { space } from "../../../theme/tokens"

export interface Kpi {
  key: string
  label: string
  value: string
  sub?: string | null
  tone?: TextTone
}

// KPI tiles: 2 per row on phones, 4 on tablets (mirrors the KpiCard row on
// apps/web/app/(dashboard)/dashboard/page.tsx). Each tile reads as one
// sentence to TalkBack ("Today's revenue, KES 12,400").
export function KpiGrid({ items }: { items: Kpi[] }) {
  const isTablet = useIsTablet()
  return (
    <View style={styles.grid}>
      {items.map((k) => (
        <Card
          key={k.key}
          style={[styles.card, isTablet ? styles.tablet : styles.phone]}
        >
          <View accessible accessibilityLabel={`${k.label}, ${k.value}${k.sub ? `, ${k.sub}` : ""}`} style={styles.body}>
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {k.label}
            </Text>
            <Text variant="headline" tone={k.tone} tabular numberOfLines={1} adjustsFontSizeToFit>
              {k.value}
            </Text>
            {k.sub ? (
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {k.sub}
              </Text>
            ) : null}
          </View>
        </Card>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  card: { flexGrow: 1 },
  phone: { flexBasis: "46%" },
  tablet: { flexBasis: "23%" },
  body: { gap: space.xxs },
})
