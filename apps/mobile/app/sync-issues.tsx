import Ionicons from "@expo/vector-icons/Ionicons"
import { FlashList } from "@shopify/flash-list"
import { useState } from "react"
import { StyleSheet, View } from "react-native"
import {
  BranchSwitcher,
  Chip,
  EmptyState,
  ErrorState,
  NeedsInternet,
  Screen,
  ScreenHeader,
  SkeletonList,
  Text,
  useIsOnline,
} from "../src/components"
import { IssueRow } from "../src/features/sync-issues/components/IssueRow"
import { ResolveSheet } from "../src/features/sync-issues/components/ResolveSheet"
import type { SyncIssue } from "../src/features/sync-issues/logic/kinds"
import { useCan } from "../src/hooks/useCan"
import { useQuery } from "../src/hooks/useQuery"
import { apiJson, withQuery } from "../src/lib/api"
import { useBranchScope } from "../src/store/branchScope"
import { useTheme } from "../src/theme/useTheme"
import { space } from "../src/theme/tokens"

// R3: the manager inbox for things selling devices did offline that need a
// human look — mirrors apps/web/app/(dashboard)/sync-issues/page.tsx (same
// Open/Resolved toggle, wording and resolve-with-a-note flow) over GET
// /api/sync-issues (devices.manage; newest 200, not paged) and PATCH
// /api/sync-issues/[id]. Online only.

type Status = "open" | "resolved"

export default function SyncIssuesScreen() {
  const online = useIsOnline()
  const can = useCan()
  const theme = useTheme()
  const scope = useBranchScope()

  return (
    <Screen>
      <ScreenHeader title="Sync issues" subtitle={online && scope.canSwitch ? scope.label : null} right={online ? <BranchSwitcher /> : null} />
      {!online ? (
        <NeedsInternet feature="Sync issues" />
      ) : !can("devices.manage") ? (
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={32} color={theme.textTertiary} />}
          title="Managers only"
          message="Only people who can manage selling devices can review sync issues."
        />
      ) : (
        <IssueList branchId={scope.branchId} isAll={scope.isAll} />
      )}
    </Screen>
  )
}

function IssueList({ branchId, isAll }: { branchId: string | undefined; isAll: boolean }) {
  const theme = useTheme()
  const [status, setStatus] = useState<Status>("open")
  const [resolving, setResolving] = useState<SyncIssue | null>(null)
  const path = withQuery("/api/sync-issues", { status, branch_id: branchId })
  const q = useQuery(path, (p) => apiJson<{ issues: SyncIssue[] }>(p))
  const issues = q.data?.issues ?? []

  const header = (
    <View style={styles.header}>
      <Text tone="secondary">Things selling devices did offline that need a look. Nothing here was lost — every sale is kept.</Text>
      <View style={styles.chips}>
        {(["open", "resolved"] as const).map((s) => (
          <Chip
            key={s}
            label={s === "open" ? "Open" : "Resolved"}
            selected={status === s}
            onPress={() => setStatus(s)}
            accessibilityLabel={`Show ${s} issues`}
          />
        ))}
      </View>
      {q.error && q.data ? <ErrorState compact message={q.error} onRetry={q.retry} /> : null}
    </View>
  )

  return (
    <View style={styles.flex}>
      {q.loading ? (
        <>
          {header}
          <SkeletonList rows={5} />
        </>
      ) : q.error && !q.data ? (
        <>
          {header}
          <ErrorState message={q.error} onRetry={q.retry} />
        </>
      ) : (
        <FlashList keyboardShouldPersistTaps="handled"
          data={issues}
          keyExtractor={(i) => i.id}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <IssueRow issue={item} showBranch={isAll} onResolve={status === "open" ? () => setResolving(item) : undefined} />
          )}
          refreshing={q.refreshing}
          onRefresh={q.refresh}
          ListEmptyComponent={
            <EmptyState
              icon={<Ionicons name="checkmark-circle-outline" size={36} color={theme.green} />}
              title={status === "open" ? "All clear" : "Nothing resolved yet"}
              message={status === "open" ? "No offline sync issues need attention." : "Issues you resolve will be listed here with your notes."}
            />
          }
        />
      )}
      <ResolveSheet
        key={resolving?.id ?? "none"}
        issue={resolving}
        onClose={() => setResolving(null)}
        onResolved={(id) => {
          setResolving(null)
          // It is no longer open: drop it here; the Resolved tab refetches on switch.
          q.setData((prev) => (prev ? { issues: prev.issues.filter((i) => i.id !== id) } : prev))
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: space.md, paddingBottom: space.sm },
  chips: { flexDirection: "row", gap: space.sm },
})
