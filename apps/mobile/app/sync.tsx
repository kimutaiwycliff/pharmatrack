import { useEffect, useMemo, useState } from "react"
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useSyncStore } from "../src/store/sync"
import { refreshSyncState, syncNow } from "../src/lib/sync/engine"
import { dismissRejected, listOutbox, type OutboxRecord } from "../src/lib/sync/outbox"
import { countdown, nairobiClock, timeAgo } from "../src/lib/sync/core/format"
import { lockMessage } from "../src/lib/sync/core/lock"
import { toast } from "../src/lib/toast"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Card, DeviceGate, EmptyState, Screen, ScreenHeader, StatusBadge, type BadgeStatus } from "../src/components"

// Full sync status (R1 rule 10): what's waiting, what the server refused and
// why, and a manual "Sync now". Rejected items are never deleted — Dismiss
// only hides one after the user confirms it has been recorded manually.

const STATUS_LABEL: Record<string, { label: string; badge: BadgeStatus }> = {
  idle: { label: "Up to date", badge: "ok" },
  syncing: { label: "Syncing…", badge: "neutral" },
  offline: { label: "Offline", badge: "warning" },
  error: { label: "Needs a retry", badge: "danger" },
  revoked: { label: "Phone removed", badge: "danger" },
}

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  sale: "receipt-outline",
  shift_open: "log-in-outline",
  shift_close: "log-out-outline",
  override: "key-outline",
  legacy_sale: "receipt-outline",
}

export default function SyncScreen() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const s = useSyncStore()
  // Bumped after a dismiss/sync so the lists re-read the outbox.
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)
  const { pendingCount, rejectedCount, status: syncStatus } = s
  const pending = useMemo(() => listOutbox("pending", 100), [version, pendingCount, syncStatus]) // eslint-disable-line react-hooks/exhaustive-deps
  const rejected = useMemo(() => listOutbox("rejected", 200), [version, rejectedCount, syncStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refreshSyncState()
  }, [])

  async function onSync() {
    const r = await syncNow("manual", { force: true })
    if (r.ok) toast.success("All synced ✓")
    else if (r.outcome === "offline") toast.error("No connection — sales stay safe on this phone")
    else if (r.message) toast.error(r.message)
    reload()
  }

  function onDismiss(item: OutboxRecord) {
    Alert.alert(
      "Dismiss this item?",
      "The server did NOT record it. Only dismiss once it has been recorded manually (e.g. on the web) — it stays in this phone's history either way.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "It's recorded — dismiss",
          style: "destructive",
          onPress: () => {
            dismissRejected(item.seq)
            refreshSyncState()
            reload()
          },
        },
      ],
    )
  }

  const status = STATUS_LABEL[s.status] ?? STATUS_LABEL.idle!

  return (
    <Screen>
      <ScreenHeader title="Sync" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!s.device || s.status === "revoked" ? <DeviceGate /> : null}

        {s.device ? (
          <Card style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.title}>{s.device.name}</Text>
              <StatusBadge status={status.badge} label={status.label} />
            </View>
            <Text style={styles.meta}>
              Device {s.device.code}
              {s.device.branchName ? ` · ${s.device.branchName}` : ""} · {s.online ? "online" : "offline"}
            </Text>
            <Text style={styles.line}>Last full sync: {timeAgo(s.lastSyncAt)}</Text>
            {s.deadline ? (
              <Text style={styles.line}>
                Sync again before: {nairobiClock(s.deadline)}
                {s.lock.msToDeadline != null && s.lock.msToDeadline > 0 ? ` (in ${countdown(s.lock.msToDeadline)})` : ""}
              </Text>
            ) : null}
            {s.lock.locked && s.lock.reason ? <Text style={styles.error}>{lockMessage(s.lock.reason)}</Text> : null}
            {s.lastError ? <Text style={styles.error}>{s.lastError}</Text> : null}
            {s.progress ? <Text style={styles.meta}>{s.progress.label}</Text> : null}
            {s.lastSummary ? (
              <Text style={styles.meta}>
                Last run: {s.lastSummary.pushed} uploaded, {s.lastSummary.productsUpdated} products updated, {s.lastSummary.deleted} removed
              </Text>
            ) : null}
            <Button
              title={s.status === "syncing" ? "Syncing…" : "Sync now"}
              onPress={onSync}
              loading={s.status === "syncing"}
              icon={<Ionicons name="sync-outline" size={18} color="#fff" />}
            />
          </Card>
        ) : null}

        <Text style={styles.section}>Waiting to upload ({s.pendingCount})</Text>
        {pending.length === 0 ? (
          <EmptyState icon={<Ionicons name="checkmark-done-outline" size={28} color={theme.green} />} message="Nothing waiting" />
        ) : (
          <Card style={styles.listCard}>
            {pending.map((p, i) => (
              <View key={p.seq} style={[styles.item, i > 0 && styles.itemBorder]}>
                <Ionicons name={TYPE_ICON[p.type] ?? "document-outline"} size={20} color={theme.textSecondary} />
                <View style={styles.itemText}>
                  <Text style={styles.itemTitle}>{p.summary ?? p.type}</Text>
                  <Text style={styles.meta}>
                    {timeAgo(p.createdAt)}
                    {p.errorMessage ? ` · ${p.errorMessage}` : ""}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        <Text style={styles.section}>Needs attention ({rejected.length})</Text>
        {rejected.length === 0 ? (
          <EmptyState icon={<Ionicons name="shield-checkmark-outline" size={28} color={theme.green} />} message="Nothing needs attention" />
        ) : (
          rejected.map((r) => (
            <Card key={r.seq} style={styles.rejectCard}>
              <View style={styles.row}>
                <Ionicons name={TYPE_ICON[r.type] ?? "document-outline"} size={20} color={theme.red} />
                <Text style={[styles.itemTitle, styles.flex]}>{r.summary ?? r.type}</Text>
              </View>
              <Text style={styles.reason}>{r.errorMessage ?? "Refused by the server"}</Text>
              <Text style={styles.meta}>
                {r.errorCode ? `${r.errorCode} · ` : ""}
                {new Date(r.createdAt).toLocaleString()}
              </Text>
              <Button title="Dismiss" variant="secondary" onPress={() => onDismiss(r)} />
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    scroll: { gap: 12, paddingBottom: 32 },
    card: { gap: 8 },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    flex: { flex: 1 },
    title: { fontSize: 18, fontWeight: "700", color: theme.text, flexShrink: 1 },
    section: { fontSize: 15, fontWeight: "700", color: theme.textSecondary, marginTop: 4 },
    line: { fontSize: 15, color: theme.text },
    meta: { fontSize: 13, color: theme.textSecondary },
    error: { fontSize: 14, color: theme.red },
    listCard: { paddingVertical: 4 },
    item: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingVertical: 6 },
    itemBorder: { borderTopWidth: 1, borderTopColor: theme.border },
    itemText: { flex: 1, gap: 2 },
    itemTitle: { fontSize: 15, color: theme.text, fontWeight: "600" },
    rejectCard: { gap: 8, borderColor: theme.red, borderWidth: 1 },
    reason: { fontSize: 14, color: theme.text },
  })
}
