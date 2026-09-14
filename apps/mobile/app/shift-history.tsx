import { useEffect, useState } from "react"
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native"
import { formatKES } from "@pharmatrack/core"
import Ionicons from "@expo/vector-icons/Ionicons"
import { apiFetch } from "../src/lib/api-fetch"
import { useSessionStore } from "../src/store/session"
import { varianceSeverity, type VarianceSeverity } from "../src/lib/shifts/variance"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Card, EmptyState, Screen, ScreenHeader, StatusBadge, type BadgeStatus } from "../src/components"

// Mirrors GET /api/shifts (apps/web/app/api/shifts/route.ts) exactly — the
// same endpoint the "current shift" screen already uses for clock-in/out,
// just without a shift_id filter so it returns the branch's shift history.
// Web's /shifts page adds date-range filtering; deferred here for a first
// pass — this shows the most recent 20 shifts for the active branch.

interface ShiftRow {
  id: string
  opening_float: number
  closing_cash: number | null
  variance: number | null
  clocked_in_at: string
  clocked_out_at: string | null
  profiles: { full_name: string; role: string }
  sale_count: number
  total_sales: number
}

function badgeFor(severity: VarianceSeverity | null): BadgeStatus {
  if (severity === "ok") return "ok"
  if (severity === "warn") return "warning"
  if (severity === "serious") return "danger"
  return "neutral"
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export default function ShiftHistory() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { branchId } = useSessionStore()
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!branchId) return
    apiFetch(`/api/shifts?branch_id=${branchId}&limit=20`)
      .then((r) => (r.ok ? (r.json() as Promise<{ shifts: ShiftRow[] }>) : Promise.reject(new Error("Failed"))))
      .then((d) => setShifts(d.shifts))
      .catch(() => setShifts([]))
      .finally(() => setLoading(false))
  }, [branchId])

  return (
    <Screen>
      <ScreenHeader title="Shift history" />
      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={theme.green} /></View>
      ) : (
        <FlatList
          data={shifts}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon={<Ionicons name="time-outline" size={32} color={theme.textTertiary} />} message="No past shifts yet" />}
          renderItem={({ item }) => {
            const severity = varianceSeverity(item.variance)
            return (
              <Card style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={styles.cashier}>{item.profiles.full_name}</Text>
                  <StatusBadge status={badgeFor(severity)} label={item.closing_cash == null ? "Open" : (severity ? severity : "balanced")} />
                </View>
                <Text style={styles.date}>{fmtDate(item.clocked_in_at)}{item.clocked_out_at ? ` – ${fmtDate(item.clocked_out_at)}` : " (still open)"}</Text>
                <View style={styles.figures}>
                  <Text style={styles.figure}>Float {formatKES(Math.round(item.opening_float * 100))}</Text>
                  <Text style={styles.figure}>Sales {formatKES(Math.round(item.total_sales * 100))} ({item.sale_count})</Text>
                  {item.variance != null && <Text style={styles.figure}>Var {formatKES(Math.round(item.variance * 100))}</Text>}
                </View>
              </Card>
            )
          }}
        />
      )}
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    list: { gap: 10, paddingBottom: 24 },
    row: { gap: 6 },
    rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    cashier: { fontSize: 14, fontWeight: "700", color: theme.text },
    date: { fontSize: 12, color: theme.textTertiary },
    figures: { flexDirection: "row", gap: 14, marginTop: 2 },
    figure: { fontSize: 12, color: theme.textSecondary },
  })
}
