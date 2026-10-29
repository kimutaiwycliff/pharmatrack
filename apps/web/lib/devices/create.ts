import { and, eq, sql } from "drizzle-orm"
import { audit_log, branch, device, type DrizzleDB } from "@pharmatrack/db"
import type { DeviceAccess, DevicePurpose } from "@pharmatrack/core"

// One way to create a device row (offline-till registration and both
// approval paths of ADR-018). The short code (D01, D02…) prints in receipt
// numbers, so it must be unique per pharmacy — a concurrent registration that
// takes the same code retries with the next one.

export interface NewDevice {
  organizationId: string
  branchId: string
  name: string
  tokenHash: string
  purpose: DevicePurpose
  platform?: string | null
  appVersion?: string | null
  actorId: string
  /** End of a temporary approval (null/undefined = until removed). */
  approvedUntil?: Date | null
  /** What the device may be used for (default: everything). */
  access?: DeviceAccess
  /** audit_log.action, e.g. device.register / device.approve */
  action: string
  auditExtra?: Record<string, unknown>
}

export type CreatedDevice = { id: string; name: string; code: string; branch_id: string; branch_name: string; purpose: DevicePurpose }

const isUniqueViolation = (err: unknown) =>
  typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505"

/** Returns null when the branch doesn't belong to the pharmacy. */
export async function createDevice(db: DrizzleDB, d: NewDevice): Promise<CreatedDevice | null> {
  const [b] = await db.select({ id: branch.id, name: branch.name }).from(branch)
    .where(and(eq(branch.id, d.branchId), eq(branch.organization_id, d.organizationId))).limit(1)
  if (!b) return null
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Savepoint, so a duplicate-code retry doesn't abort the caller's transaction.
      return await db.transaction(async (tx) => {
        const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(device)
          .where(eq(device.organization_id, d.organizationId))) as [{ n: number }]
        const code = `D${String(n + 1 + attempt).padStart(2, "0")}`
        const [row] = await tx.insert(device).values({
          organization_id: d.organizationId, branch_id: b.id, name: d.name, device_code: code,
          token_hash: d.tokenHash, platform: d.platform ?? null, app_version: d.appVersion ?? null,
          registered_by: d.actorId, last_seen_at: new Date(), purpose: d.purpose, approved_until: d.approvedUntil ?? null, access: d.access ?? "all",
        }).returning()
        await tx.insert(audit_log).values({
          organization_id: d.organizationId, actor_id: d.actorId, action: d.action,
          entity: "device", entity_id: row!.id, diff: { name: d.name, code, branch: b.name, purpose: d.purpose, access: d.access ?? "all", ...d.auditExtra },
        })
        return { id: row!.id, name: row!.name, code, branch_id: b.id, branch_name: b.name, purpose: d.purpose }
      })
    } catch (err) {
      if (isUniqueViolation(err)) continue
      throw err
    }
  }
  throw new Error("Couldn't allocate a device code, try again")
}
