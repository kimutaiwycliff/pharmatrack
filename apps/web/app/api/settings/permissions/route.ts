import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { withTenant, role_permission, audit_log } from "@pharmatrack/db"
import {
  CONFIGURABLE_ROLES, isCapability, overridesFor, resolveMatrix, resolvePermissions, toggleCapability,
  type Capability, type StaffRole,
} from "@pharmatrack/core"
import { getApiContext } from "@/lib/api-auth"

// Settings → Roles & permissions. Owner-only by design: the matrix itself is
// not a delegable capability, otherwise a manager could grant themselves
// anything. Only cells that differ from the defaults are stored.

const roleSchema = z.enum(CONFIGURABLE_ROLES as unknown as [StaffRole, ...StaffRole[]])
const patchSchema = z.union([
  z.object({ role: roleSchema, capability: z.string().refine(isCapability, "Unknown capability"), allowed: z.boolean() }),
  z.object({ reset: z.union([roleSchema, z.literal("all")]) }),
])

async function ownerContext() {
  const ctx = await getApiContext()
  if ("error" in ctx) return ctx
  if (ctx.role !== "owner") {
    return { error: NextResponse.json({ error: "Only the owner can manage role permissions" }, { status: 403 }) }
  }
  return ctx
}

async function readMatrix(ctx: Parameters<typeof withTenant>[0]) {
  const overrides = await withTenant(ctx, (db) =>
    db.select({ role: role_permission.role, capability: role_permission.capability, allowed: role_permission.allowed })
      .from(role_permission),
  )
  return { matrix: resolveMatrix(overrides), overrides }
}

export async function GET() {
  const ctx = await ownerContext()
  if ("error" in ctx) return ctx.error
  return NextResponse.json(await readMatrix(ctx))
}

export async function PATCH(req: NextRequest) {
  const ctx = await ownerContext()
  if ("error" in ctx) return ctx.error
  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const body = parsed.data

  await withTenant(ctx, async (db) => {
    const roles: StaffRole[] = "reset" in body
      ? (body.reset === "all" ? [...CONFIGURABLE_ROLES] : [body.reset])
      : [body.role]

    for (const role of roles) {
      const existing = await db.select({ role: role_permission.role, capability: role_permission.capability, allowed: role_permission.allowed })
        .from(role_permission).where(eq(role_permission.role, role))
      const before = resolvePermissions(role, existing)
      const after = "reset" in body
        ? resolvePermissions(role)
        : toggleCapability(before, body.capability as Capability, body.allowed)

      // Rewrite this role's override rows to the minimal diff from defaults.
      await db.delete(role_permission).where(and(eq(role_permission.organization_id, ctx.organizationId), eq(role_permission.role, role)))
      const rows = overridesFor(role, after)
      if (rows.length > 0) {
        await db.insert(role_permission).values(rows.map((r) => ({
          organization_id: ctx.organizationId, role, capability: r.capability, allowed: r.allowed, updated_by: ctx.userId,
        })))
      }

      const granted = after.filter((c) => !before.includes(c))
      const revoked = before.filter((c) => !after.includes(c))
      if (granted.length > 0 || revoked.length > 0) {
        await db.insert(audit_log).values({
          organization_id: ctx.organizationId, actor_id: ctx.userId,
          action: "reset" in body ? "role_permissions.reset" : "role_permissions.update",
          entity: "role", entity_id: role,
          diff: { granted, revoked },
        })
      }
    }
  })

  return NextResponse.json(await readMatrix(ctx))
}
