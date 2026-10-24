import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq, isNull, sql } from "drizzle-orm"
import { audit_log, dbAdmin, device, org_settings } from "@pharmatrack/db"
import { ANDROID_DEVICE_LOCK_MIN_VERSION, compareVersions, type DeviceLockSettings } from "@pharmatrack/core"
import { getApiContext } from "@/lib/api-auth"
import { countUnapprovedSessions, endUnapprovedSessions, loadDeviceLock } from "@/lib/devices/lock"
import { pendingRequests } from "@/lib/devices/pairing"

// Settings → Devices → "Only approved devices" (ADR-018). Owner only: the
// owner is the one person the lock never applies to, so only they can be
// trusted to switch it.

const schema = z.object({ enabled: z.boolean(), managers_exempt: z.boolean() }).strict()

function ownerOnly(role: string) {
  return role === "owner" ? null : NextResponse.json({ error: "Only the pharmacy owner can change this.", code: "owner_only" }, { status: 403 })
}

async function summary(organizationId: string, lock: DeviceLockSettings) {
  const devices = await dbAdmin().select({ purpose: device.purpose, platform: device.platform, app_version: device.app_version })
    .from(device).where(and(eq(device.organization_id, organizationId), isNull(device.revoked_at)))
  const androidOld = devices.filter((d) => d.platform === "android" && compareVersions(d.app_version ?? "0", ANDROID_DEVICE_LOCK_MIN_VERSION) < 0).length
  const [withManagers, withoutManagers, pending] = await Promise.all([
    countUnapprovedSessions(organizationId, { enabled: true, managers_exempt: false }),
    countUnapprovedSessions(organizationId, { enabled: true, managers_exempt: true }),
    pendingRequests(organizationId),
  ])
  return {
    tills: devices.filter((d) => d.purpose === "till").length,
    office: devices.filter((d) => d.purpose === "office").length,
    pending: pending.length,
    android_old: androidOld,
    android_min_version: ANDROID_DEVICE_LOCK_MIN_VERSION,
    // Who would be signed out if the lock were switched on now, per option.
    unapproved_now: lock.managers_exempt ? withoutManagers : withManagers,
    unapproved_if: { managers_locked: withManagers, managers_exempt: withoutManagers },
  }
}

export async function GET() {
  const ctx = await getApiContext({ permission: "devices.manage" })
  if ("error" in ctx) return ctx.error
  const lock = await loadDeviceLock(ctx.organizationId)
  return NextResponse.json({ lock, can_edit: ctx.role === "owner", summary: await summary(ctx.organizationId, lock) })
}

export async function PUT(request: NextRequest) {
  const ctx = await getApiContext()
  if ("error" in ctx) return ctx.error
  const denied = ownerOnly(ctx.role)
  if (denied) return denied
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const next = parsed.data
  const before = await loadDeviceLock(ctx.organizationId)

  await dbAdmin().insert(org_settings).values({ organization_id: ctx.organizationId, settings: { device_lock: next } })
    .onConflictDoUpdate({
      target: org_settings.organization_id,
      set: { settings: sql`${org_settings.settings} || ${JSON.stringify({ device_lock: next })}::jsonb`, updated_at: new Date() },
    })

  // Switching on (or widening it to managers) signs out the people it now
  // covers who are on devices nobody approved; they get the approval screen.
  const signedOut = next.enabled ? await endUnapprovedSessions(ctx.organizationId, next) : 0

  await dbAdmin().insert(audit_log).values({
    organization_id: ctx.organizationId, actor_id: ctx.userId, action: "settings.device_lock", entity: "organization", entity_id: ctx.organizationId,
    diff: { before, after: next, signed_out: signedOut },
  })
  return NextResponse.json({ lock: next, signed_out: signedOut, summary: await summary(ctx.organizationId, next) })
}
