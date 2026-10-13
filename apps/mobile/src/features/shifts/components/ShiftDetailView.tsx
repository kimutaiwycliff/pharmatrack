import Ionicons from "@expo/vector-icons/Ionicons"
import { formatKES } from "@pharmatrack/core"
import { useState } from "react"
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native"
import { Button, Card, ErrorState, SkeletonBlock, SkeletonCards, StatusBadge, Text } from "../../../components"
import { useCan } from "../../../hooks/useCan"
import { useQuery } from "../../../hooks/useQuery"
import { formatDateTime } from "../../../lib/dates"
import { useSessionStore } from "../../../store/session"
import { useStaffStore } from "../../../store/staff"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { fetchShift } from "../api"
import { expectedCashCents, isOpenShift, kesToCents, shiftBadge } from "../logic/shifts"
import { Divider, FigureRow, VarianceSummary } from "./Figures"
import { ForceCloseSheet, type ForceCloseTarget } from "./ForceCloseSheet"

// R3: one shift from GET /api/shifts/[id] (apps/web/app/api/shifts/[id]/
// route.ts) — who, where, when, the drawer maths (float + cash sales =
// expected vs counted) with the variance explained in words, the other
// payment totals, and notes. Open shifts can be force-closed by managers.
export function ShiftDetailView({ shiftId }: { shiftId: string }) {
  const theme = useTheme()
  const can = useCan()
  const branches = useSessionStore((s) => s.branches)
  const currentStaffId = useStaffStore((s) => s.current?.id)
  const q = useQuery(`shift:${shiftId}`, () => fetchShift(shiftId))
  const [closing, setClosing] = useState<ForceCloseTarget | null>(null)

  if (q.loading) {
    return (
      <View style={styles.content}>
        <SkeletonBlock height={28} width="60%" />
        <SkeletonCards count={4} />
      </View>
    )
  }
  if (!q.data) return <ErrorState message={q.error ?? "Shift not found"} onRetry={q.retry} />

  const s = q.data
  const open = isOpenShift(s)
  const badge = shiftBadge(s)
  const branchName = branches.find((b) => b.id === s.branch_id)?.name ?? null
  const floatCents = kesToCents(s.opening_float)
  const cashCents = kesToCents(s.cash_sales)
  const mpesaCents = kesToCents(s.mpesa_sales)
  const totalCents = kesToCents(s.total_sales)
  // Card / anything not cash or M-Pesa (payment-table split, so splits are counted by part).
  const otherCents = Math.max(0, totalCents - cashCents - mpesaCents)
  const splitCents = kesToCents(s.split_sales)
  const expected = expectedCashCents(floatCents, cashCents)
  const counted = s.closing_cash == null ? null : kesToCents(s.closing_cash)
  const canForceClose = open && can("shifts.close_others") && s.staff_id !== currentStaffId

  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={theme.green} colors={[theme.green]} />}
      >
        {q.error ? <ErrorState compact message={q.error} onRetry={q.retry} /> : null}

        <Card style={styles.card}>
          <View style={styles.titleRow}>
            <View style={styles.flex}>
              <Text variant="title" accessibilityRole="header">
                {s.profiles.full_name}
              </Text>
              <Text tone="secondary">
                {[roleLabel(s.profiles.role), branchName].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <StatusBadge status={badge.status} label={badge.label} />
          </View>
          <View style={styles.timeRow}>
            <Ionicons name="log-in-outline" size={18} color={theme.textSecondary} />
            <Text>Clocked in {formatDateTime(s.clocked_in_at)}</Text>
          </View>
          <View style={styles.timeRow}>
            <Ionicons name="log-out-outline" size={18} color={theme.textSecondary} />
            <Text tone={s.clocked_out_at ? "default" : "secondary"}>
              {s.clocked_out_at ? `Clocked out ${formatDateTime(s.clocked_out_at)}` : "Still open"}
            </Text>
          </View>
        </Card>

        <Card style={styles.card}>
          <Text variant="headline" accessibilityRole="header">
            Cash drawer
          </Text>
          <FigureRow label="Opening float" cents={floatCents} />
          <FigureRow label="Cash sales" cents={cashCents} />
          <Divider />
          <FigureRow label={open ? "Expected in drawer now" : "Expected cash"} cents={expected} strong />
          {open ? null : <FigureRow label="Counted cash" cents={counted} strong />}
          {open ? null : (
            <>
              <Divider />
              <VarianceSummary varianceCents={s.variance == null ? null : kesToCents(s.variance)} />
            </>
          )}
        </Card>

        <Card style={styles.card}>
          <Text variant="headline" accessibilityRole="header">
            Sales
          </Text>
          <FigureRow label={`Total (${s.sale_count} ${s.sale_count === 1 ? "sale" : "sales"})`} cents={totalCents} strong />
          <FigureRow label="Cash" cents={cashCents} />
          <FigureRow label="M-Pesa" cents={mpesaCents} />
          {otherCents > 0 ? <FigureRow label="Card and other" cents={otherCents} /> : null}
          {splitCents > 0 ? (
            <Text variant="caption" tone="secondary">
              Includes split-payment sales worth {formatKES(splitCents)} — their cash and M-Pesa parts are counted above.
            </Text>
          ) : null}
        </Card>

        {s.notes ? (
          <Card style={styles.card}>
            <Text variant="headline" accessibilityRole="header">
              Notes
            </Text>
            <Text>{s.notes}</Text>
          </Card>
        ) : null}

        {canForceClose ? (
          <Button
            title="Force close shift"
            variant="danger"
            size="lg"
            leadingIcon={<Ionicons name="stop-circle-outline" size={20} color={theme.onAccent} />}
            onPress={() => setClosing({ id: s.id, cashierName: s.profiles.full_name, clockedInAt: s.clocked_in_at })}
            accessibilityHint={`Ends ${s.profiles.full_name}'s shift for them`}
          />
        ) : null}
      </ScrollView>
      <ForceCloseSheet
        key={closing?.id ?? "none"}
        target={closing}
        onClose={() => setClosing(null)}
        onClosed={() => {
          setClosing(null)
          q.refresh()
        }}
      />
    </>
  )
}

const roleLabel = (role: string) => (role ? role.charAt(0).toUpperCase() + role.slice(1) : role)

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xxl },
  card: { gap: space.sm, padding: space.lg },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  timeRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
})
