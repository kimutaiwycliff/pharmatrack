"use client"

import type { OverrideRecord } from "@pharmatrack/core/sync"
import { tillDB } from "./db"
import { readMeta, refreshTillState, trustedClockNow, writeMeta } from "./engine"
import { enqueue, outboxCounts } from "./outbox"
import { useTillStore } from "./store"
import { verifyRosterPin } from "./staff"

// Manager unlock after a missed midnight sync (same rule as Android). A
// roster member with `sync.override` enters their PIN; selling unlocks until
// 12:00 (the server's reservation grace window) and an `override` outbox item
// tells the server who did it and how many sales were waiting. Every sale
// made under it carries override_client_id. One unlock per missed deadline.

export type OverrideResult = { ok: true; until: number } | { ok: false; error: string }

export async function performOverride(managerId: string, pin: string): Promise<OverrideResult> {
  await refreshTillState()
  const { lock } = useTillStore.getState()
  if (!lock.locked || lock.reason !== "deadline" || !lock.overrideAvailable || lock.overrideUntil == null) {
    return { ok: false, error: "A manager unlock isn't available right now. Connect to the internet and sync instead." }
  }
  const db = tillDB()
  const manager = await db.staff.get(managerId)
  if (!manager || !manager.permissions.includes("sync.override")) {
    return { ok: false, error: "This person can't unlock the till after a missed sync." }
  }
  const check = await verifyRosterPin(managerId, pin)
  if (!check.ok) return check

  const meta = await readMeta()
  if (meta.deadline == null) return { ok: false, error: "Sync once before using a manager unlock." }
  const record: OverrideRecord = {
    client_id: `ov-${crypto.randomUUID()}`,
    manager_id: manager.id,
    manager_name: manager.name,
    at: await trustedClockNow(),
    until: lock.overrideUntil,
    deadline: meta.deadline,
  }
  const pending = (await outboxCounts()).pendingSales
  await db.transaction("rw", db.outbox, db.meta, async () => {
    await enqueue(record.client_id, {
      type: "override", client_id: record.client_id, manager_id: record.manager_id,
      at: new Date().toISOString(), until: new Date(record.until).toISOString(), pending_sales: pending,
    }, `Manager unlock by ${manager.name} until 12:00`, db)
    await writeMeta({ override: record })
  })
  await refreshTillState()
  return { ok: true, until: record.until }
}
