import * as Crypto from "expo-crypto"
import { sqlite } from "../../db/database"
import { useSyncStore } from "../../store/sync"
import { enqueue, outboxCounts } from "./outbox"
import { readMeta, refreshSyncState, trustedClockNow, writeMeta } from "./engine"
import { getRosterMember, verifyRosterPin } from "./roster"
import type { OverrideRecord } from "./core/lock"

// R1 rule 3 — manager override after a missed midnight sync. A roster member
// with `sync.override` enters their PIN; selling unlocks until 12:00 the same
// day (the server's reservation grace window) and an `override` outbox item
// tells the server who did it and how many sales were waiting. Every sale made
// under it carries override_client_id. One override per missed deadline.

export type OverrideResult = { ok: true; until: number } | { ok: false; error: string }

export async function performOverride(managerId: string, pin: string): Promise<OverrideResult> {
  refreshSyncState()
  const { lock } = useSyncStore.getState()
  if (!lock.locked || lock.reason !== "deadline" || !lock.overrideAvailable || lock.overrideUntil == null) {
    return { ok: false, error: "A manager unlock isn't available right now. Connect and sync instead." }
  }
  const manager = getRosterMember(managerId)
  if (!manager || !manager.permissions.includes("sync.override")) {
    return { ok: false, error: "This person can't unlock the till after a missed sync" }
  }
  const check = await verifyRosterPin(managerId, pin)
  if (!check.ok) return check

  const meta = readMeta()
  if (meta.deadline == null) return { ok: false, error: "Sync once before using an override" }
  const now = trustedClockNow()
  const record: OverrideRecord = {
    client_id: `ov-${Crypto.randomUUID()}`,
    manager_id: manager.id,
    manager_name: manager.name,
    at: now,
    until: lock.overrideUntil,
    deadline: meta.deadline,
  }
  sqlite.withTransactionSync(() => {
    enqueue(record.client_id, {
      type: "override",
      client_id: record.client_id,
      manager_id: record.manager_id,
      at: new Date(Date.now()).toISOString(),
      until: new Date(record.until).toISOString(),
      pending_sales: outboxCounts().pendingSales,
    }, `Manager unlock by ${manager.name} until 12:00`)
    writeMeta({ override: record })
  })
  refreshSyncState()
  return { ok: true, until: record.until }
}
