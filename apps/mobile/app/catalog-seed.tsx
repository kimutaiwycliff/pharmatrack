import { useEffect, useState } from "react"
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from "react-native"
import { apiFetch } from "../src/lib/api-fetch"
import { toast } from "../src/lib/toast"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Card, Screen, ScreenHeader } from "../src/components"

// Mirrors apps/web/app/api/catalog/seed/route.ts exactly: GET returns the
// department breakdown (KEML catalog total vs already-seeded per department),
// POST seeds selected (or all) departments, DELETE unseeds anything never
// batched or sold. Same "Quick Start" concept as web's onboarding wizard,
// just without the review-grid step (app/products.tsx already lets an owner
// tune price/stock afterward — no need to duplicate that editor here).

interface Department { category: string; total: number; seeded: number }

export default function CatalogSeed() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [busyCategory, setBusyCategory] = useState<string | null>(null)
  const [seedingAll, setSeedingAll] = useState(false)
  const [unseeding, setUnseeding] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await apiFetch("/api/catalog/seed")
      if (!res.ok) throw new Error("Failed to load")
      const json = (await res.json()) as { departments: Department[] }
      setDepartments(json.departments)
    } catch {
      toast.error("Could not load the drug catalog")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // load() also runs again after seed/unseed, so it can't be inlined away.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [])

  async function seed(categories?: string[]) {
    if (categories) setBusyCategory(categories[0]!)
    else setSeedingAll(true)
    try {
      const res = await apiFetch("/api/catalog/seed", {
        method: "POST",
        body: JSON.stringify({ categories }),
      })
      const json = (await res.json()) as { seeded: number; updated: number; error?: string }
      if (!res.ok) throw new Error(json.error ?? "Could not seed")
      toast.success(`Added ${json.seeded} product${json.seeded === 1 ? "" : "s"}${json.updated ? `, updated ${json.updated}` : ""}`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      if (categories) setBusyCategory(null)
      else setSeedingAll(false)
    }
  }

  function confirmUnseed() {
    Alert.alert(
      "Remove seeded products?",
      "Removes catalog-seeded products that have never been received into stock or sold. Anything you've already used stays untouched.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove", style: "destructive",
          onPress: async () => {
            setUnseeding(true)
            try {
              const res = await apiFetch("/api/catalog/seed", { method: "DELETE" })
              const json = (await res.json()) as { removed: number; kept: number }
              if (!res.ok) throw new Error("Could not remove")
              toast.success(`Removed ${json.removed} product${json.removed === 1 ? "" : "s"}${json.kept ? ` (kept ${json.kept} already in use)` : ""}`)
              await load()
            } catch {
              toast.error("Could not remove seeded products")
            } finally {
              setUnseeding(false)
            }
          },
        },
      ],
    )
  }

  const catalogTotal = departments.reduce((n, d) => n + d.total, 0)
  const seededTotal = departments.reduce((n, d) => n + d.seeded, 0)

  return (
    <Screen>
      <ScreenHeader title="Drug catalog" />
      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={theme.green} /></View>
      ) : (
        <>
          <Card style={styles.summaryCard}>
            <Text style={styles.summaryText}>{seededTotal} of {catalogTotal} KEML products loaded into your catalogue</Text>
            <View style={styles.summaryActions}>
              <Button title="Seed all" onPress={() => seed()} loading={seedingAll} style={styles.summaryButton} />
              <Button title="Remove unused" variant="secondary" onPress={confirmUnseed} loading={unseeding} style={styles.summaryButton} />
            </View>
          </Card>

          <FlatList
            data={departments}
            keyExtractor={(d) => d.category}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Card style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowLabel}>{item.category}</Text>
                  <Text style={styles.rowMeta}>{item.seeded} / {item.total} loaded</Text>
                </View>
                <Button
                  title={item.seeded >= item.total ? "Done" : "Seed"}
                  variant="secondary"
                  disabled={item.seeded >= item.total}
                  loading={busyCategory === item.category}
                  onPress={() => seed([item.category])}
                  style={styles.rowButton}
                />
              </Card>
            )}
          />
        </>
      )}
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    summaryCard: { gap: 10, marginBottom: 12 },
    summaryText: { fontSize: 14, fontWeight: "600", color: theme.text },
    summaryActions: { flexDirection: "row", gap: 8 },
    summaryButton: { flex: 1 },
    list: { gap: 8, paddingBottom: 24 },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    rowInfo: { flex: 1 },
    rowLabel: { fontSize: 14, fontWeight: "600", color: theme.text },
    rowMeta: { fontSize: 12, color: theme.textTertiary, marginTop: 2 },
    rowButton: { paddingHorizontal: 14, paddingVertical: 8 },
  })
}
