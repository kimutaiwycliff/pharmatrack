import Ionicons from "@expo/vector-icons/Ionicons"
import { FlashList } from "@shopify/flash-list"
import { router } from "expo-router"
import { useMemo, useRef, useState } from "react"
import { ScrollView, StyleSheet, View } from "react-native"
import {
  Button, Chip, EmptyState, ErrorState, Money, NeedsInternet, Screen, ScreenHeader, SkeletonList, StatusBadge, Text,
  useIsOnline,
} from "../../src/components"
import {
  buildDraftOrderBody, groupSuggestions, REASON_LABEL, reasonBadge, suggestionHint, type SuggestionGroup,
} from "../../src/features/purchasing/logic/suggestions"
import { packName, type RestockSuggestion } from "../../src/features/purchasing/logic/types"
import { useCan } from "../../src/hooks/useCan"
import { useApiQuery } from "../../src/hooks/useQuery"
import { apiJson, errorMessage, withQuery } from "../../src/lib/api"
import { useIdempotencyKey } from "../../src/lib/useIdempotencyKey"
import { toast } from "../../src/lib/toast"
import { useBranchScope } from "../../src/store/branchScope"
import { useSessionStore } from "../../src/store/session"
import { useTheme } from "../../src/theme/useTheme"
import { radius, space } from "../../src/theme/tokens"

// Restock suggestions (purchasing.manage, online only) — the read-only side of
// web's restock planner (apps/web/app/(dashboard)/purchase-orders/new): what's
// out / low / selling faster than stock covers (30-day sales, 30 days' cover),
// grouped one draft order per supplier. "Create draft PO" posts that group to
// POST /api/purchase-orders and opens the new order. Editing quantities,
// adding products and changing the look-back window stay on web.

type Row =
  | { type: "header"; group: SuggestionGroup }
  | { type: "item"; s: RestockSuggestion; key: string }
  | { type: "footer"; group: SuggestionGroup }

interface SuggestionsResponse {
  suggestions: RestockSuggestion[]
  windowDays: number
  coverDays: number
}

export default function RestockSuggestionsScreen() {
  const online = useIsOnline()
  const can = useCan()
  if (!online) {
    return (
      <Screen>
        <ScreenHeader title="Restock suggestions" />
        <NeedsInternet feature="Restock suggestions" />
      </Screen>
    )
  }
  if (!can("purchasing.manage")) {
    return (
      <Screen>
        <ScreenHeader title="Restock suggestions" />
        <EmptyState icon={<NoAccessIcon />} message="Only people who can create purchase orders see restock suggestions." />
      </Screen>
    )
  }
  return <Suggestions />
}

function NoAccessIcon() {
  const theme = useTheme()
  return <Ionicons name="lock-closed-outline" size={36} color={theme.textTertiary} />
}

function Suggestions() {
  const theme = useTheme()
  const can = useCan()
  const canSeeCost = can("cost.view")
  const scope = useBranchScope()
  const sessionBranchId = useSessionStore((s) => s.branchId)
  // Suggestions are per branch — "All branches" has to pick one to restock.
  const [picked, setPicked] = useState<string | null>(null)
  const branchId = scope.branchId ?? picked ?? sessionBranchId ?? scope.branches[0]?.id ?? null
  const branchName = scope.branches.find((b) => b.id === branchId)?.name ?? null

  const q = useApiQuery<SuggestionsResponse>(branchId ? withQuery("/api/purchase-orders/suggestions", { branch_id: branchId }) : null)
  const [done, setDone] = useState<Set<string>>(() => new Set())
  const [creating, setCreating] = useState<string | null>(null)

  const groups = useMemo(() => groupSuggestions(q.data?.suggestions ?? []).filter((g) => !done.has(g.key)), [q.data, done])
  const rows = useMemo<Row[]>(
    () =>
      groups.flatMap((g) => [
        { type: "header" as const, group: g },
        ...g.items.map((s) => ({ type: "item" as const, s, key: `${g.key}:${s.product_id}` })),
        { type: "footer" as const, group: g },
      ]),
    [groups],
  )

  // Ref guard: one draft at a time, and never a second one for the same
  // supplier group (its row disappears only after the re-render).
  const creatingRef = useRef(false)
  const createdKeys = useRef(new Set<string>())
  // Retrying a draft after a timeout replays it instead of creating a second.
  const idem = useIdempotencyKey()

  async function create(group: SuggestionGroup) {
    if (!branchId || creatingRef.current || createdKeys.current.has(group.key)) return
    creatingRef.current = true
    setCreating(group.key)
    try {
      const body = buildDraftOrderBody(branchId, group, canSeeCost)
      const res = await apiJson<{ id: string; po_number: string }>("/api/purchase-orders", {
        method: "POST",
        body,
        headers: idem.headerFor(body),
      })
      createdKeys.current.add(group.key)
      setDone((d) => new Set(d).add(group.key))
      toast.success(`Draft ${res.po_number} created — review it, then send it to the supplier`)
      router.push({ pathname: "/purchase-orders/[id]", params: { id: res.id } })
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't create the purchase order. Please try again."))
    } finally {
      creatingRef.current = false
      setCreating(null)
    }
  }

  const subtitle = q.data
    ? `${branchName ? `${branchName} · ` : ""}last ${q.data.windowDays} days' sales, ${q.data.coverDays} days' cover`
    : branchName

  return (
    <Screen>
      <ScreenHeader title="Restock suggestions" subtitle={subtitle} />
      {scope.canSwitch && scope.isAll ? (
        <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} style={styles.chipBar} contentContainerStyle={styles.chips}>
          {scope.branches.map((b) => (
            <Chip key={b.id} label={b.name} selected={b.id === branchId} onPress={() => setPicked(b.id)} accessibilityLabel={`Restock ${b.name}`} />
          ))}
        </ScrollView>
      ) : null}
      {!branchId ? (
        <EmptyState icon={<Ionicons name="storefront-outline" size={36} color={theme.textTertiary} />} message="Pick a branch to restock." />
      ) : q.loading ? (
        <SkeletonList rows={8} />
      ) : q.error && !q.data ? (
        <ErrorState message={q.error} onRetry={q.retry} />
      ) : (
        <FlashList keyboardShouldPersistTaps="handled"
          data={rows}
          keyExtractor={(r) => (r.type === "item" ? r.key : `${r.type}:${r.group.key}`)}
          getItemType={(r) => r.type}
          refreshing={q.refreshing}
          onRefresh={q.refresh}
          ListHeaderComponent={q.error ? <ErrorState compact message={q.error} onRetry={q.retry} /> : null}
          renderItem={({ item: r }) => {
            if (r.type === "header") return <GroupHeader group={r.group} />
            if (r.type === "item") return <SuggestionRow s={r.s} canSeeCost={canSeeCost} />
            return (
              <View style={[styles.footer, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Button
                  title="Create draft PO"
                  onPress={() => create(r.group)}
                  loading={creating === r.group.key}
                  disabled={creating !== null}
                  accessibilityLabel={`Create a draft purchase order for ${r.group.supplierName}`}
                  leadingIcon={<Ionicons name="document-text-outline" size={18} color={theme.onAccent} />}
                />
              </View>
            )
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<Ionicons name="checkmark-circle-outline" size={36} color={theme.green} />}
              title="Nothing to restock"
              message={
                done.size > 0
                  ? "Every suggestion now has a draft order. Review them in Purchase orders."
                  : "Stock covers expected sales, counting what's already on order."
              }
              action={{ label: "Purchase orders", onPress: () => router.navigate("/purchase-orders") }}
            />
          }
        />
      )}
    </Screen>
  )
}

function GroupHeader({ group }: { group: SuggestionGroup }) {
  const theme = useTheme()
  return (
    <View style={[styles.header, { borderColor: theme.border, backgroundColor: theme.muted }]}>
      <View style={styles.flex}>
        <Text variant="headline" accessibilityRole="header">
          {group.supplierName}
        </Text>
        <Text variant="caption" tone="secondary">
          {group.items.length} item{group.items.length === 1 ? "" : "s"}
          {group.supplierId ? "" : " · pick a supplier on the draft before sending"}
        </Text>
      </View>
      {group.totalCents != null ? (
        <View style={styles.right}>
          <Text variant="caption" tone="secondary">
            Est. budget
          </Text>
          <Money cents={group.totalCents} />
        </View>
      ) : null}
    </View>
  )
}

function SuggestionRow({ s, canSeeCost }: { s: RestockSuggestion; canSeeCost: boolean }) {
  const theme = useTheme()
  const name = `${s.name}${s.strength ? ` ${s.strength}` : ""}`
  const order = `Order ${s.suggested_packs} × ${packName(s)}`
  const hint = suggestionHint(s)
  return (
    <View
      style={[styles.item, { borderColor: theme.border, backgroundColor: theme.surface }]}
      accessible
      accessibilityLabel={`${name}, ${REASON_LABEL[s.reason]}. ${order}. ${hint}`}
    >
      <View style={styles.flex}>
        <Text variant="bodyStrong">{name}</Text>
        <Text variant="caption" tone="secondary">
          {hint}
        </Text>
        <StatusBadge status={reasonBadge(s.reason)} label={REASON_LABEL[s.reason]} />
      </View>
      <View style={styles.right}>
        <Text variant="label" tabular>
          {order}
        </Text>
        {canSeeCost && s.cost_per_pack != null ? (
          <Money cents={Math.round(s.cost_per_pack * 100) * s.suggested_packs} variant="caption" tone="secondary" />
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: space.xxs },
  chipBar: { flexGrow: 0, marginBottom: space.sm },
  chips: { gap: space.sm },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    marginTop: space.md,
    borderWidth: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  item: { flexDirection: "row", gap: space.md, padding: space.md, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: StyleSheet.hairlineWidth },
  right: { alignItems: "flex-end", gap: space.xxs },
  footer: {
    padding: space.md,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
})
