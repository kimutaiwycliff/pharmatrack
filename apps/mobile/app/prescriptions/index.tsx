import Ionicons from "@expo/vector-icons/Ionicons"
import { FlashList } from "@shopify/flash-list"
import { router, useFocusEffect } from "expo-router"
import { useCallback, useMemo, useState, type ReactNode } from "react"
import { ScrollView, StyleSheet, View } from "react-native"
import {
  Chip, EmptyState, ErrorState, IconButton, NeedsInternet, Screen, ScreenHeader, SkeletonList, TextField, useIsOnline,
} from "../../src/components"
import { PrescriptionRow, PrescriptionSheet } from "../../src/features/clinical/components/PrescriptionParts"
import { fetchPrescriptions, setPrescriptionStatus } from "../../src/features/clinical/data"
import { matchesPrescription, RX_TABS } from "../../src/features/clinical/logic/prescriptions"
import { useClinicalDirty } from "../../src/features/clinical/store"
import type { Prescription } from "../../src/features/clinical/types"
import { useCan } from "../../src/hooks/useCan"
import { useQuery } from "../../src/hooks/useQuery"
import { errorMessage } from "../../src/lib/api"
import { env } from "../../src/lib/env"
import { haptics } from "../../src/lib/haptics"
import { toast } from "../../src/lib/toast"
import { useTheme } from "../../src/theme/useTheme"
import { space } from "../../src/theme/tokens"

// Prescriptions list — mirrors apps/web/app/(dashboard)/prescriptions/page.tsx:
// Active / Completed / All tabs, Complete / Cancel while active. The API has
// no search parameter, so the search box filters the loaded list (≤100 rows).
// Offline Edition reads the local SQLite repo (features/clinical/data.ts).

type Tab = (typeof RX_TABS)[number]["key"]

export default function Prescriptions() {
  const theme = useTheme()
  const can = useCan()
  const canManage = can("prescriptions.manage")
  const online = useIsOnline()
  const reachable = env.EXPO_PUBLIC_OFFLINE_MODE || online
  const [tab, setTab] = useState<Tab>("active")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Prescription | null>(null)
  const [busy, setBusy] = useState<"completed" | "cancelled" | null>(null)

  const q = useQuery(reachable ? `rx:${tab}` : null, (key) => fetchPrescriptions(key.slice(3)))
  const { refresh } = q
  const locked = !!q.data && "locked" in q.data
  const list = useMemo(() => (q.data && !("locked" in q.data) ? q.data : []), [q.data])
  const shown = useMemo(() => list.filter((rx) => matchesPrescription(rx, query)), [list, query])

  // Back from "New prescription" after a save → reload.
  useFocusEffect(
    useCallback(() => {
      if (useClinicalDirty.getState().take("prescriptions")) refresh()
    }, [refresh]),
  )

  async function changeStatus(rx: Prescription, status: "completed" | "cancelled") {
    setBusy(status)
    try {
      await setPrescriptionStatus(rx.id, status)
      haptics.success()
      toast.success(status === "completed" ? "Marked completed" : "Prescription cancelled")
      setSelected(null)
      // Drop it from a tab it no longer belongs to; keep it (updated) under All.
      q.setData((prev) =>
        prev && !("locked" in prev)
          ? tab === "all"
            ? prev.map((p) => (p.id === rx.id ? { ...p, status } : p))
            : prev.filter((p) => p.id !== rx.id)
          : prev,
      )
    } catch (err) {
      haptics.error()
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const newRx = () => router.push("/prescriptions/new")

  const header = (
    <ScreenHeader
      title="Prescriptions"
      subtitle="Dispensing records with allergy & interaction checks"
      right={canManage && reachable ? <IconButton icon="add" variant="filled" accessibilityLabel="New prescription" onPress={newRx} /> : null}
    />
  )

  if (!reachable) {
    return (
      <Screen>
        {header}
        <NeedsInternet feature="Prescriptions" />
      </Screen>
    )
  }

  let body: ReactNode
  if (q.loading) body = <SkeletonList rows={6} />
  else if (q.error && !q.data) body = <ErrorState message={q.error} onRetry={q.retry} />
  else if (locked)
    body = (
      <EmptyState
        icon={<Ionicons name="lock-closed-outline" size={32} color={theme.textTertiary} />}
        title="Prescriptions aren't included in your plan"
        message="Ask your account owner to upgrade the subscription to unlock prescriptions."
        action={{ label: "Check again", onPress: q.retry }}
      />
    )
  else
    body = (
      <FlashList
        data={shown}
        keyExtractor={(rx) => rx.id}
        renderItem={({ item }) => <PrescriptionRow rx={item} onPress={() => setSelected(item)} />}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={q.error ? <ErrorState compact message={q.error} onRetry={q.retry} /> : null}
        ListEmptyComponent={
          query.trim() ? (
            <EmptyState
              icon={<Ionicons name="search-outline" size={32} color={theme.textTertiary} />}
              message={`No prescriptions match "${query.trim()}"`}
              action={{ label: "Clear search", onPress: () => setQuery("") }}
            />
          ) : (
            <EmptyState
              icon={<Ionicons name="document-text-outline" size={32} color={theme.textTertiary} />}
              message={tab === "all" ? "No prescriptions yet" : `No ${tab} prescriptions`}
              action={canManage ? { label: "New prescription", onPress: newRx } : undefined}
            />
          )
        }
      />
    )

  return (
    <Screen>
      {header}
      <View style={styles.controls}>
        <TextField
          label="Search prescriptions"
          hideLabel
          value={query}
          onChangeText={setQuery}
          placeholder="Patient, phone, drug or prescriber"
          autoCorrect={false}
          returnKeyType="search"
          leading={<Ionicons name="search-outline" size={20} color={theme.textTertiary} />}
          trailing={
            query ? <IconButton icon="close-circle" accessibilityLabel="Clear search" color={theme.textTertiary} onPress={() => setQuery("")} /> : null
          }
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {RX_TABS.map((t) => (
            <Chip key={t.key} label={t.label} selected={tab === t.key} onPress={() => setTab(t.key)} accessibilityLabel={`Show ${t.label.toLowerCase()} prescriptions`} />
          ))}
        </ScrollView>
      </View>
      <View style={styles.flex}>{body}</View>
      <PrescriptionSheet rx={selected} canManage={canManage} busy={busy} onClose={() => setSelected(null)} onStatus={changeStatus} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  controls: { gap: space.sm, marginBottom: space.sm },
  chips: { gap: space.sm },
})
