import { useMemo, useState } from "react"
import { StyleSheet, View } from "react-native"
import { Button, Card, ErrorState, ListRow, SkeletonList, Text, useIsOnline } from "../../../components"
import { formatDateTime, formatTime } from "../../../lib/dates"
import { scheduleSoonSync } from "../../../lib/sync/engine"
import { listOpenShifts, listRecentShifts } from "../../../lib/sync/shifts"
import { useQuery } from "../../../hooks/useQuery"
import { useSessionStore } from "../../../store/session"
import { useShiftStore } from "../../../store/shift"
import { space } from "../../../theme/tokens"
import type { LocalShiftRow } from "../../../db/schema"
import { fetchShiftsPage, type ShiftListRow } from "../api"
import { remoteOpenShifts } from "../logic/shifts"
import { ForceCloseSheet, type ForceCloseTarget } from "./ForceCloseSheet"
import { confirm as askConfirm } from "../../../lib/confirm"
import { toast } from "../../../lib/toast"

// R3: what a manager with shifts.close_others sees under their own shift on
// the Shifts tab (online build only — the caller hides it in the Offline
// Edition):
//  1. Other people's shifts still open ON THIS PHONE (R1) — closed locally and
//     uploaded through the sync outbox as a shift_close, so it works offline.
//  2. Other people's shifts open on OTHER phones / the web for this branch —
//     GET /api/shifts, force-closed with PATCH /api/shifts (online only).
// The server list has no "open only" filter, so the newest 50 shifts are
// scanned; an open shift is always among the newest unless 50+ newer ones exist.

const REMOTE_SCAN_LIMIT = 50

interface Props {
  currentStaffId: string | null
  /** Changes whenever the current person's own shift opens/closes, so the local list re-reads. */
  activeShiftId: string | null
}

export function OtherOpenShifts({ currentStaffId, activeShiftId }: Props) {
  const online = useIsOnline()
  const sessionBranchId = useSessionStore((s) => s.branchId)
  const forceCloseLocal = useShiftStore((s) => s.forceCloseShift)
  const [localVersion, setLocalVersion] = useState(0)
  const [target, setTarget] = useState<ForceCloseTarget | null>(null)

  // SQLite reads are synchronous; re-read when our own shift or a force-close changes things.
  const localShifts = useMemo(
    () => ({ open: listOpenShifts().filter((sh) => sh.cashierId !== currentStaffId), recent: listRecentShifts(REMOTE_SCAN_LIMIT) }),
    [currentStaffId, activeShiftId, localVersion], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const remote = useQuery(online ? `open-shifts:${sessionBranchId ?? "all"}` : null, () =>
    fetchShiftsPage(1, sessionBranchId ?? undefined, REMOTE_SCAN_LIMIT),
  )
  const remoteOpen: ShiftListRow[] = useMemo(
    () =>
      remoteOpenShifts(
        remote.data?.items ?? [],
        localShifts.recent.map((l) => ({ cashierId: l.cashierId, openedAt: l.openedAt })),
        currentStaffId,
      ),
    [remote.data, localShifts, currentStaffId],
  )

  async function confirmLocal(sh: LocalShiftRow) {
    const name = sh.cashierName ?? "this person"
    const ok = await askConfirm({
      title: `Close ${name}'s shift?`,
      message: "Use this when they forgot to clock out. No cash count is recorded — it's marked as force-closed by you.",
      confirmLabel: "Force close",
      destructive: true,
    })
    if (!ok) return
    if (await forceCloseLocal(sh.clientId)) {
      setLocalVersion((v) => v + 1)
      scheduleSoonSync()
      toast.success(`${name}'s shift closed`)
    } else {
      // The store keeps the reason in `error`; a missing staff/shift leaves none.
      toast.error(useShiftStore.getState().error ?? "Couldn't close that shift — it may already be closed.")
      setLocalVersion((v) => v + 1)
    }
  }

  const showRemoteSection = online && (remote.loading || !!remote.error || remoteOpen.length > 0)
  if (localShifts.open.length === 0 && !showRemoteSection && online) return null

  return (
    <>
      {localShifts.open.length > 0 ? (
        <Card style={styles.card}>
          <Text variant="headline" accessibilityRole="header">
            Other open shifts on this phone
          </Text>
          {localShifts.open.map((sh) => (
            <ListRow
              key={sh.clientId}
              title={sh.cashierName ?? "Staff"}
              subtitle={`Since ${formatTime(new Date(sh.openedAt))}`}
              trailing={
                <Button
                  title="Force close"
                  size="sm"
                  variant="danger"
                  // Returning the promise keeps the button busy through confirm + close.
                  onPress={() => confirmLocal(sh)}
                  accessibilityLabel={`Force close ${sh.cashierName ?? "this"} shift`}
                />
              }
              style={styles.row}
            />
          ))}
        </Card>
      ) : null}

      {online ? (
        showRemoteSection ? (
          <Card style={styles.card}>
            <Text variant="headline" accessibilityRole="header">
              Open on other tills
            </Text>
            {remote.loading ? (
              <SkeletonList rows={2} />
            ) : remote.error ? (
              <ErrorState compact message={remote.error} onRetry={remote.retry} />
            ) : (
              remoteOpen.map((sh) => (
                <ListRow
                  key={sh.id}
                  title={sh.profiles.full_name}
                  subtitle={`Since ${formatDateTime(sh.clocked_in_at)}${sh.branch_name && !sessionBranchId ? ` · ${sh.branch_name}` : ""}`}
                  trailing={
                    <Button
                      title="Force close"
                      size="sm"
                      variant="danger"
                      onPress={() => setTarget({ id: sh.id, cashierName: sh.profiles.full_name, clockedInAt: sh.clocked_in_at })}
                      accessibilityLabel={`Force close ${sh.profiles.full_name}'s shift`}
                    />
                  }
                  style={styles.row}
                />
              ))
            )}
          </Card>
        ) : null
      ) : (
        <View style={styles.offlineNote}>
          <Text variant="caption" tone="secondary">
            Connect to the internet to see shifts left open on other tills.
          </Text>
        </View>
      )}

      <ForceCloseSheet
        key={target?.id ?? "none"}
        target={target}
        onClose={() => setTarget(null)}
        onClosed={(id) => {
          setTarget(null)
          remote.setData((prev) => (prev ? { ...prev, items: prev.items.filter((s) => s.id !== id) } : prev))
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.xs, padding: space.lg },
  row: { paddingHorizontal: 0 },
  offlineNote: { paddingHorizontal: space.xs },
})
