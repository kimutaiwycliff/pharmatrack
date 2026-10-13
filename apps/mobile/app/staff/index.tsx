import Ionicons from "@expo/vector-icons/Ionicons"
import { FlashList } from "@shopify/flash-list"
import { useCallback, useMemo, useState } from "react"
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native"
import { router, useFocusEffect } from "expo-router"
import {
  Chip, EmptyState, ErrorState, IconButton, ListRow, MasterDetail, NeedsInternet, Screen, ScreenHeader, Sheet,
  SkeletonList, StatusBadge, TextField, useIsOnline,
} from "../../src/components"
import { StaffDetail } from "../../src/features/staff/components/StaffDetail"
import { consumeStaffChanged, fetchStaff } from "../../src/features/staff/data"
import {
  branchLabel, canManageStaff, filterStaff, roleLabel, staffBadge, type StaffMember, type StatusFilter,
} from "../../src/features/staff/logic/staff"
import { useCan } from "../../src/hooks/useCan"
import { useIsTablet } from "../../src/hooks/useIsTablet"
import { useQuery } from "../../src/hooks/useQuery"
import { env } from "../../src/lib/env"
import { useSessionStore } from "../../src/store/session"
import { useStaffStore } from "../../src/store/staff"
import { useTheme } from "../../src/theme/useTheme"
import { space } from "../../src/theme/tokens"

// Staff (capability staff.manage) — mirrors web's /staff page over
// GET /api/staff; the Offline Edition reads the local staff table instead.
// Tap a row to manage it: a bottom sheet on phones, the right-hand pane on
// tablets. Rows you can't manage (owners/other managers for a manager, and
// yourself — the server refuses both) open nothing and show a lock.
// Invite / create lives on its own form screen (/staff/new).

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
]

export default function Staff() {
  const theme = useTheme()
  const can = useCan()
  const online = useIsOnline()
  const allowed = can("staff.manage")

  if (!allowed) {
    return (
      <Screen>
        <ScreenHeader title="Staff" />
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
          message="Only owners and managers can view staff."
        />
      </Screen>
    )
  }
  if (!OFFLINE && !online) {
    return (
      <Screen>
        <ScreenHeader title="Staff" />
        <NeedsInternet feature="Staff" />
      </Screen>
    )
  }
  return <StaffScreen />
}

function StaffScreen() {
  const theme = useTheme()
  const tablet = useIsTablet()
  const branches = useSessionStore((s) => s.branches)
  const sessionRole = useSessionStore((s) => s.role)
  const me = useStaffStore((s) => s.current)
  const actorRole = me?.role ?? sessionRole
  const q = useQuery<StaffMember[]>(OFFLINE ? "local:staff" : "/api/staff", fetchStaff)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { refresh } = q
  // Back from /staff/new after inviting someone → reload the list.
  useFocusEffect(
    useCallback(() => {
      if (consumeStaffChanged()) refresh()
    }, [refresh]),
  )

  const all = q.data
  const rows = useMemo(() => filterStaff(all ?? [], search, status), [all, search, status])
  // Derived from the list, so a refetch after any write updates the open detail.
  const selected = all?.find((m) => m.id === selectedId) ?? null
  const filtered = search.trim() !== "" || status !== "all"

  const addButton = (
    <IconButton
      icon="person-add-outline"
      variant="filled"
      accessibilityLabel={OFFLINE ? "Add staff member" : "Invite staff member"}
      onPress={() => router.push("/staff/new")}
    />
  )

  const detail = selected ? (
    <StaffDetail
      key={selected.id}
      member={selected}
      branches={branches}
      inSheet={!tablet}
      onChanged={refresh}
      onRemoved={() => setSelectedId(null)}
    />
  ) : null

  let list
  if (q.loading) list = <SkeletonList rows={6} />
  else if (q.error && !all) list = <ErrorState message={q.error} onRetry={q.retry} />
  else
    list = (
      <FlashList
        data={rows}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={refresh} tintColor={theme.green} colors={[theme.green]} />}
        ListHeaderComponent={q.error ? <ErrorState compact message={q.error} onRetry={q.retry} /> : null}
        renderItem={({ item }) => {
          const manageable = canManageStaff(actorRole, item, me?.id)
          const badge = staffBadge(item)
          const isMe = !!me && me.id === item.id
          return (
            <ListRow
              title={isMe ? `${item.full_name} (you)` : item.full_name}
              subtitle={`${roleLabel(item.role)} · ${branchLabel(item)}`}
              meta={<StatusBadge status={badge.tone} label={badge.label} />}
              leading={<Ionicons name="person-circle-outline" size={32} color={theme.textSecondary} />}
              trailing={
                <Ionicons
                  name={manageable ? "chevron-forward" : "lock-closed-outline"}
                  size={18}
                  color={theme.textTertiary}
                />
              }
              onPress={manageable ? () => setSelectedId(item.id) : undefined}
              accessibilityLabel={`${item.full_name}, ${roleLabel(item.role)}, ${branchLabel(item)}, ${badge.label}`}
              accessibilityHint={manageable ? "Opens staff details" : isMe ? "Edit your own details in Settings" : undefined}
              style={tablet && item.id === selectedId ? { backgroundColor: theme.mutedStrong } : undefined}
            />
          )
        }}
        ListEmptyComponent={
          filtered ? (
            <EmptyState
              icon={<Ionicons name="search-outline" size={28} color={theme.textTertiary} />}
              message="No staff match your search"
              action={{ label: "Clear filters", onPress: () => { setSearch(""); setStatus("all") } }}
            />
          ) : (
            <EmptyState
              icon={<Ionicons name="people-outline" size={28} color={theme.textTertiary} />}
              title="No staff members yet"
              message={OFFLINE ? "Add the people who work here so they can sign in with a PIN." : "Invite the people who work here by email."}
              action={{ label: OFFLINE ? "Add staff member" : "Invite staff", onPress: () => router.push("/staff/new") }}
            />
          )
        }
      />
    )

  const master = (
    <View style={styles.flex}>
      <TextField
        label="Search staff"
        hideLabel
        placeholder="Search by name, phone, role or branch"
        value={search}
        onChangeText={setSearch}
        leading={<Ionicons name="search-outline" size={18} color={theme.textTertiary} />}
        autoCorrect={false}
        returnKeyType="search"
      />
      <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.filterBar}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={status === f.key} onPress={() => setStatus(f.key)} accessibilityLabel={`Show ${f.label.toLowerCase()} staff`} />
        ))}
      </ScrollView>
      <View style={styles.flex}>{list}</View>
    </View>
  )

  return (
    <Screen>
      <ScreenHeader
        title="Staff"
        subtitle={all ? `${all.length} ${all.length === 1 ? "person" : "people"}` : null}
        right={addButton}
      />
      {tablet ? (
        <MasterDetail
          master={master}
          detail={detail ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{detail}</ScrollView> : null}
          placeholder={{
            icon: <Ionicons name="people-outline" size={32} color={theme.textTertiary} />,
            message: "Select a staff member to manage their role, branch and PIN.",
          }}
        />
      ) : (
        <>
          {master}
          <Sheet open={!tablet && !!selected} onClose={() => setSelectedId(null)} title="Staff member" snapPoints={["90%"]} scrollable>
            {detail}
          </Sheet>
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filterBar: { flexGrow: 0, marginTop: space.sm, marginBottom: space.xs },
  filters: { gap: space.sm },
})
