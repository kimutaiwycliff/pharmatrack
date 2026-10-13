import Ionicons from "@expo/vector-icons/Ionicons"
import { FlashList } from "@shopify/flash-list"
import { router } from "expo-router"
import { ActivityIndicator, StyleSheet, View } from "react-native"
import {
  BranchSwitcher,
  EmptyState,
  ErrorState,
  NeedsInternet,
  Screen,
  ScreenHeader,
  SkeletonList,
  useIsOnline,
} from "../src/components"
import { fetchShiftsPage } from "../src/features/shifts/api"
import { ShiftRow } from "../src/features/shifts/components/ShiftRow"
import { useCan } from "../src/hooks/useCan"
import { usePagedQuery } from "../src/hooks/useQuery"
import { useBranchScope } from "../src/store/branchScope"
import { useTheme } from "../src/theme/useTheme"
import { space } from "../src/theme/tokens"

// R3: every till session for the branch (or all branches), newest first —
// GET /api/shifts with page/limit (apps/web/app/api/shifts/route.ts), the same
// list as the web /shifts page. Online only; needs shifts.view_all (without
// it the server would only return the person's own shifts). The server has no
// status filter, so there are no Open/Short/Over chips: filtering just the
// loaded pages would hide matching shifts further down.
export default function ShiftHistory() {
  const online = useIsOnline()
  const can = useCan()
  const scope = useBranchScope()
  const theme = useTheme()

  return (
    <Screen>
      <ScreenHeader title="Shift history" subtitle={online ? scope.label : null} right={online ? <BranchSwitcher /> : null} />
      {!online ? (
        <NeedsInternet feature="Shift history" />
      ) : !can("shifts.view_all") ? (
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={32} color={theme.textTertiary} />}
          title="Managers only"
          message="Ask a manager or the owner to give your role permission to see everyone's shifts."
        />
      ) : (
        <ShiftList branchId={scope.branchId} isAll={scope.isAll} />
      )}
    </Screen>
  )
}

function ShiftList({ branchId, isAll }: { branchId: string | undefined; isAll: boolean }) {
  const theme = useTheme()
  const q = usePagedQuery(`shifts:${branchId ?? "all"}`, (page) => fetchShiftsPage(page, branchId))

  if (q.loading) return <SkeletonList rows={8} />
  if (q.error && q.items.length === 0) return <ErrorState message={q.error} onRetry={q.retry} />

  return (
    <View style={styles.flex}>
      {q.error ? <ErrorState compact message={q.error} onRetry={q.retry} /> : null}
      <FlashList keyboardShouldPersistTaps="handled"
        data={q.items}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <ShiftRow shift={item} showBranch={isAll} onPress={() => router.push({ pathname: "/shift/[id]", params: { id: item.id } })} />
        )}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        onEndReached={q.loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={q.loadingMore ? <ActivityIndicator style={styles.footer} color={theme.green} /> : null}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="time-outline" size={32} color={theme.textTertiary} />}
            title="No shifts yet"
            message={isAll ? "Shifts appear here once staff clock in on a till." : "No one has clocked in at this branch yet."}
            action={{ label: "Go to Shifts", onPress: () => router.navigate("/shifts") }}
          />
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: space.sm },
  footer: { paddingVertical: space.lg },
})
