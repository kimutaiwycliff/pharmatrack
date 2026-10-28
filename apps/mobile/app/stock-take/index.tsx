import Ionicons from "@expo/vector-icons/Ionicons"
import { router, useFocusEffect } from "expo-router"
import { useCallback, useMemo, useRef, useState } from "react"
import { ScrollView, StyleSheet, View } from "react-native"
import {
  BranchSwitcher, Button, Card, Chip, EmptyState, ErrorState, ListRow, Screen, ScreenHeader, Sheet, SkeletonList, Text, useIsOnline,
} from "../../src/components"
import { useCan } from "../../src/hooks/useCan"
import { useQuery } from "../../src/hooks/useQuery"
import { errorMessage } from "../../src/lib/api"
import { env } from "../../src/lib/env"
import { toast } from "../../src/lib/toast"
import { fetchShelves, flushAllQueues, startSession } from "../../src/features/stockTake/data"
import type { Shelf } from "../../src/features/stockTake/logic"
import { useBranchScope } from "../../src/store/branchScope"
import { useSessionStore } from "../../src/store/session"
import { useTheme } from "../../src/theme/useTheme"
import { space } from "../../src/theme/tokens"

// Stock take, shelf by shelf (ADR-020) — the Android twin of
// apps/web/app/(dashboard)/inventory/stock-take/page.tsx. Starting a count
// needs a connection; a count already started opens and keeps counting
// offline (src/features/stockTake/data.ts).

type Mode = "count" | "setup"
const DAY = 86_400_000
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short" })

export default function StockTakeScreen() {
  const theme = useTheme()
  const can = useCan()
  if (env.EXPO_PUBLIC_OFFLINE_MODE || !can("stock.count")) {
    return (
      <Screen>
        <ScreenHeader title="Stock take" />
        <EmptyState icon={<Ionicons name="lock-closed-outline" size={32} color={theme.textTertiary} />}
          message={env.EXPO_PUBLIC_OFFLINE_MODE ? "Stock take needs the online edition of PharmaTrack." : "You don't have permission to do stock takes. Ask the owner or a manager."} />
      </Screen>
    )
  }
  return <Shelves />
}

function Shelves() {
  const theme = useTheme()
  const online = useIsOnline()
  const scope = useBranchScope()
  const sessionBranchId = useSessionStore((s) => s.branchId)
  const branchId = scope.branchId ?? sessionBranchId ?? null
  const q = useQuery(branchId ? `stock-take:${branchId}` : null, () => fetchShelves(branchId!))
  const [now] = useState(() => Date.now())

  // Back from a count, or reconnected: send queued counts, then refresh.
  const seen = useRef(false)
  const refresh = q.refresh
  useFocusEffect(useCallback(() => {
    void flushAllQueues()
    if (seen.current) refresh()
    seen.current = true
  }, [refresh]))

  const data = q.data
  const totalProducts = data?.shelves.reduce((n, s) => n + s.products, 0) ?? 0
  const [chosen, setMode] = useState<Mode | null>(null)
  const mode: Mode = chosen ?? (data?.can.setup && totalProducts < 30 ? "setup" : "count")
  const [hideQty, setHideQty] = useState(true)
  const [open, setOpen] = useState<Shelf | null>(null)
  const [starting, setStarting] = useState<string | null>(null)

  const shelves = useMemo(() => (data?.shelves ?? []).filter((s) => (mode === "count" ? s.products > 0 : s.catalog > 0 || s.products > 0)), [data, mode])
  const waiting = data?.can.adjust ? (data.sessions ?? []).filter((s) => s.status === "review") : []
  const inProgress = (data?.sessions ?? []).filter((s) => s.status !== "posted" && !waiting.includes(s))

  async function start(shelf: Shelf) {
    if (!branchId) return
    if (!online) { toast.error("Starting a count needs the internet. Counts already started work offline."); return }
    setStarting(shelf.id)
    try {
      const r = await startSession({ branch_id: branchId, kind: mode, category_id: shelf.categoryId, taxonomy_key: shelf.taxonomyKey, hide_expected: mode === "count" ? hideQty : false })
      if (r.resumed) toast.info(`Continuing the ${shelf.name} count already in progress`)
      setOpen(null)
      router.push({ pathname: "/stock-take/[id]", params: { id: r.id } })
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't start the count."))
    } finally {
      setStarting(null)
    }
  }

  const due = (s: Shelf) => !s.lastCounted || now - new Date(s.lastCounted).getTime() > 90 * DAY

  return (
    <Screen>
      <ScreenHeader title="Stock take" subtitle={data?.offline ? "Offline — showing your last copy" : scope.canSwitch ? scope.label : null} right={<BranchSwitcher />} />
      {q.loading ? <SkeletonList rows={8} /> : q.error && !data ? <ErrorState message={q.error} onRetry={q.retry} /> : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {data?.can.setup ? (
            <View style={styles.row}>
              <Chip label="Count the shelf" selected={mode === "count"} onPress={() => setMode("count")} />
              <Chip label="Set up from catalogue" selected={mode === "setup"} onPress={() => setMode("setup")} />
            </View>
          ) : null}
          <Text variant="caption" tone="secondary">
            {mode === "setup" ? "Walk your shelves and add products, prices and stock together." : "Count one shelf at a time. Counting keeps working without internet."}
          </Text>

          {waiting.length > 0 ? (
            <Card style={styles.gap}>
              <Text variant="label">Waiting for your approval</Text>
              {waiting.map((s) => (
                <ListRow key={s.id} title={s.title} subtitle={`${s.lines} counted${s.created_by ? ` by ${s.created_by}` : ""}`}
                  leading={<Ionicons name="shield-checkmark-outline" size={20} color={theme.amber} />}
                  onPress={() => router.push({ pathname: "/stock-take/[id]", params: { id: s.id } })} />
              ))}
            </Card>
          ) : null}
          {inProgress.length > 0 ? (
            <Card style={styles.gap}>
              <Text variant="label">In progress</Text>
              {inProgress.map((s) => (
                <ListRow key={s.id} title={s.title}
                  subtitle={`${s.status === "review" ? "Waiting for approval" : `${s.lines} counted`} · ${s.kind === "setup" ? "Setup" : "Count"}`}
                  onPress={() => router.push({ pathname: "/stock-take/[id]", params: { id: s.id } })} />
              ))}
            </Card>
          ) : null}

          {mode === "count" ? <Chip label="Hide recorded quantities while counting" selected={hideQty} onPress={() => setHideQty((v) => !v)} /> : null}
          <Text variant="label" tone="secondary">{mode === "setup" ? "Pick a shelf to set up" : "Pick a shelf to count"}</Text>
          {shelves.length === 0 ? (
            <EmptyState icon={<Ionicons name="layers-outline" size={32} color={theme.textTertiary} />}
              message={mode === "count" ? "No products on your shelves yet. Use “Set up from catalogue” to add them shelf by shelf." : "No shelves to set up."} />
          ) : shelves.map((s) => (
            <ListRow key={s.id} title={s.name}
              subtitle={mode === "setup"
                ? `${s.catalog} common medicines${s.products ? ` · ${s.products} added` : ""}`
                : `${s.products} product${s.products === 1 ? "" : "s"} · ${s.lastCounted ? `counted ${fmt(s.lastCounted)}` : "never counted"}`}
              leading={mode === "count" ? <View style={[styles.dot, { backgroundColor: due(s) ? theme.amber : theme.green }]} /> : null}
              trailing={<Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />}
              onPress={() => setOpen(s)} />
          ))}
        </ScrollView>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name}
        footer={open ? <Button title={mode === "setup" ? "Set up all" : "Count all"} loading={starting === open.id} disabled={!online || starting !== null} onPress={() => start(open)} /> : undefined}>
        {!online ? <Text tone="warning" variant="caption">Starting a count needs the internet.</Text> : null}
        {(open?.children ?? []).filter((c) => (mode === "count" ? c.products > 0 : c.catalog > 0 || c.products > 0)).map((c) => (
          <ListRow key={c.id} title={c.name} subtitle={mode === "setup" ? `${c.catalog} common medicines` : `${c.products} products`}
            disabled={!online || starting !== null} onPress={() => start(c)}
            trailing={starting === c.id ? <Text variant="caption">Starting…</Text> : <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />} />
        ))}
      </Sheet>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { gap: space.md, paddingBottom: space.xxl },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  gap: { gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
})
