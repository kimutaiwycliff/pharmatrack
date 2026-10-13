import { useState } from "react"
import { RefreshControl, StyleSheet, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import Ionicons from "@expo/vector-icons/Ionicons"
import { apiJson, errorMessage } from "../src/lib/api"
import { env } from "../src/lib/env"
import { getLocalCatalogSeedStatus, seedLocalCatalog, unseedLocalCatalog } from "../src/repo/catalogSeed"
import { toast } from "../src/lib/toast"
import { useCan } from "../src/hooks/useCan"
import { useQuery } from "../src/hooks/useQuery"
import { useTheme } from "../src/theme/useTheme"
import { radius, space } from "../src/theme/tokens"
import {
  Button, Card, EmptyState, ErrorState, ListRow, Screen, ScreenHeader, SkeletonList, StatusBadge, Text,
} from "../src/components"
import {
  isDepartmentDone, seedResultMessage, seedTotals, unseedResultMessage, type Department,
} from "../src/features/catalogue/logic/catalogSeed"
import { confirm as askConfirm } from "../src/lib/confirm"

// Mirrors apps/web/app/api/catalog/seed/route.ts: GET returns the department
// breakdown (KEML catalog total vs already-seeded per department), POST seeds
// selected (or all) departments, DELETE unseeds anything never batched or
// sold. The whole route needs catalog.seed. Same "Quick Start" idea as web's
// onboarding wizard without the review grid (Products already lets an owner
// tune prices afterwards). The Offline Edition uses the local repo instead.

async function fetchDepartments(): Promise<Department[]> {
  if (env.EXPO_PUBLIC_OFFLINE_MODE) return (await getLocalCatalogSeedStatus()).departments
  return (await apiJson<{ departments: Department[] }>("/api/catalog/seed")).departments
}

export default function CatalogSeed() {
  const theme = useTheme()
  const can = useCan()
  const allowed = can("catalog.seed")
  const q = useQuery(allowed ? "catalog-seed" : null, fetchDepartments)
  const departments = q.data ?? []
  const [busyCategory, setBusyCategory] = useState<string | null>(null)
  const [seedingAll, setSeedingAll] = useState(false)
  const [unseeding, setUnseeding] = useState(false)

  if (!allowed) {
    return (
      <Screen>
        <ScreenHeader title="Drug catalog" />
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={32} color={theme.textTertiary} />}
          title="No access"
          message="Loading the drug catalog is for owners and managers. Ask the owner to turn on “Load the drug catalog” for your role."
        />
      </Screen>
    )
  }

  async function seed(categories?: string[]) {
    if (categories) setBusyCategory(categories[0]!)
    else setSeedingAll(true)
    try {
      const json = env.EXPO_PUBLIC_OFFLINE_MODE
        ? await seedLocalCatalog(categories)
        : await apiJson<{ seeded: number; updated: number }>("/api/catalog/seed", { method: "POST", body: { categories } })
      toast.success(seedResultMessage(json.seeded, json.updated))
      q.refresh()
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't load the catalogue products. Please try again."))
    } finally {
      if (categories) setBusyCategory(null)
      else setSeedingAll(false)
    }
  }

  async function unseed() {
    setUnseeding(true)
    try {
      const json = env.EXPO_PUBLIC_OFFLINE_MODE
        ? await unseedLocalCatalog()
        : await apiJson<{ removed: number; kept: number }>("/api/catalog/seed", { method: "DELETE" })
      toast.success(unseedResultMessage(json.removed, json.kept))
      q.refresh()
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't remove the catalogue products. Please try again."))
    } finally {
      setUnseeding(false)
    }
  }

  async function confirmUnseed() {
    const ok = await askConfirm({
      title: "Remove seeded products?",
      message:
        "Removes catalog-seeded products that have never been received into stock or sold. Anything you've already used stays untouched.",
      confirmLabel: "Remove",
      destructive: true,
    })
    if (ok) await unseed()
  }

  const totals = seedTotals(departments)
  const pct = totals.total > 0 ? Math.round((totals.seeded / totals.total) * 100) : 0
  const anyBusy = seedingAll || unseeding || busyCategory !== null

  const summary = (
    <Card style={styles.summary}>
      <Text variant="bodyStrong">
        {totals.seeded} of {totals.total} KEML products loaded
      </Text>
      <View
        style={[styles.track, { backgroundColor: theme.mutedStrong }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Catalog loaded"
        accessibilityValue={{ min: 0, max: 100, now: pct }}
      >
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: theme.green }]} />
      </View>
      <Text variant="caption" tone="secondary">
        Seeded products start inactive and unpriced — review them in Products before selling.
      </Text>
      <View style={styles.summaryActions}>
        <Button
          title="Seed all"
          onPress={() => seed()}
          loading={seedingAll}
          disabled={anyBusy && !seedingAll}
          style={styles.flex}
        />
        <Button
          title="Remove unused"
          variant="secondary"
          onPress={confirmUnseed}
          loading={unseeding}
          disabled={anyBusy && !unseeding}
          style={styles.flex}
        />
      </View>
      {q.error ? <ErrorState compact message={q.error} onRetry={q.retry} /> : null}
    </Card>
  )

  let body
  if (q.loading) {
    body = <SkeletonList rows={8} />
  } else if (q.error && !q.data) {
    body = <ErrorState message={q.error} onRetry={q.retry} />
  } else {
    body = (
      <FlashList keyboardShouldPersistTaps="handled"
        data={departments}
        keyExtractor={(d) => d.category}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={theme.green} colors={[theme.green]} />}
        ListHeaderComponent={summary}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const done = isDepartmentDone(item)
          return (
            <ListRow
              title={item.category}
              subtitle={`${item.seeded} of ${item.total} loaded`}
              accessibilityLabel={`${item.category}, ${item.seeded} of ${item.total} loaded`}
              trailing={
                done ? (
                  <StatusBadge status="ok" label="Done" />
                ) : (
                  <Button
                    title="Seed"
                    size="sm"
                    variant="secondary"
                    accessibilityLabel={`Seed ${item.category}`}
                    loading={busyCategory === item.category}
                    disabled={anyBusy && busyCategory !== item.category}
                    onPress={() => seed([item.category])}
                  />
                )
              }
            />
          )
        }}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="medical-outline" size={32} color={theme.textTertiary} />}
            title="Catalog not available"
            message="The drug catalog has no departments to load right now."
            action={{ label: "Reload", onPress: q.refresh }}
          />
        }
      />
    )
  }

  return (
    <Screen>
      <ScreenHeader title="Drug catalog" subtitle="Kenya Essential Medicines List" />
      <View style={styles.flex}>{body}</View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { paddingBottom: space.xxl },
  summary: { gap: space.sm, marginBottom: space.md },
  track: { height: 8, borderRadius: radius.pill, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill },
  summaryActions: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
})
