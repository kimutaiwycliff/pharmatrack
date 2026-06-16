import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { withTenant, branch as branchTable, product, product_batch } from "@pharmatrack/db"
import { getTenantContext, type Role } from "@/lib/auth/helpers"

const MAX_ROWS = 2000

const truthy = new Set(["true", "yes", "y", "1", "controlled", "rx", "prescription"])
function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v
  return truthy.has(String(v ?? "").trim().toLowerCase())
}

const rowSchema = z
  .object({
    name: z.string().trim().min(1, "name is required"),
    brand_name: z.string().trim().optional(),
    manufacturer: z.string().trim().optional(),
    gtin: z.string().trim().optional(),
    strength: z.string().trim().optional(),
    dosage_form: z.string().trim().optional(),
    base_unit: z.string().trim().optional(),
    pack_label: z.string().trim().optional(),
    units_per_pack: z.coerce.number().int().positive().optional(),
    cost_price: z.coerce.number().nonnegative().optional(),
    selling_price: z.coerce.number().positive("selling_price must be greater than 0"),
    reorder_level: z.coerce.number().int().nonnegative().optional(),
    is_controlled: z.unknown().optional(),
    requires_prescription: z.unknown().optional(),
    opening_qty: z.coerce.number().int().nonnegative().optional(),
    batch_number: z.string().trim().optional(),
    expiry_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "expiry_date must be YYYY-MM-DD").optional(),
  })
  .transform((r) => {
    const clean = <T,>(v: T) => (typeof v === "string" && v.trim() === "" ? undefined : v)
    return {
      ...r,
      brand_name: clean(r.brand_name), manufacturer: clean(r.manufacturer), gtin: clean(r.gtin),
      strength: clean(r.strength), dosage_form: clean(r.dosage_form), base_unit: clean(r.base_unit),
      pack_label: clean(r.pack_label), batch_number: clean(r.batch_number), expiry_date: clean(r.expiry_date),
    }
  })

const payloadSchema = z.object({
  branch_id: z.string().optional(),
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_ROWS),
})

export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(["owner", "manager", "pharmacist"] as Role[]).includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = payloadSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })

  // Validate the target branch belongs to this org (opening stock needs it).
  let branchId: string | null = null
  if (parsed.data.branch_id) {
    const [b] = await withTenant(ctx.organizationId, (db) =>
      db.select({ id: branchTable.id }).from(branchTable).where(and(eq(branchTable.id, parsed.data.branch_id!), eq(branchTable.organization_id, ctx.organizationId))).limit(1),
    )
    if (!b) return NextResponse.json({ error: "Branch not found in your organization" }, { status: 400 })
    branchId = b.id
  }

  let created = 0, stockBatches = 0
  const errors: Array<{ row: number; name: string; error: string }> = []

  for (let i = 0; i < parsed.data.rows.length; i++) {
    const rowNum = i + 1
    const result = rowSchema.safeParse(parsed.data.rows[i])
    if (!result.success) {
      const raw = parsed.data.rows[i] as Record<string, unknown>
      errors.push({ row: rowNum, name: String(raw.name ?? "—"), error: result.error.issues[0]?.message ?? "Invalid row" })
      continue
    }
    const r = result.data
    try {
      // Independent transaction per row so one failure doesn't roll back the rest.
      const newId = await withTenant(ctx.organizationId, async (db) => {
        const [p] = await db.insert(product).values({
          organization_id: ctx.organizationId, created_by: ctx.userId,
          name: r.name, brand_name: r.brand_name ?? null, manufacturer: r.manufacturer ?? null,
          gtin: r.gtin ?? null, strength: r.strength ?? null, dosage_form: r.dosage_form ?? null,
          base_unit: r.base_unit ?? "unit", pack_label: r.pack_label ?? null, units_per_pack: r.units_per_pack ?? 1,
          cost_price: r.cost_price == null ? null : String(r.cost_price), selling_price: String(r.selling_price),
          reorder_level: r.reorder_level ?? 10, is_controlled: toBool(r.is_controlled), requires_prescription: toBool(r.requires_prescription),
        }).returning({ id: product.id })
        return p!.id
      })
      created++

      if (r.opening_qty && r.opening_qty > 0) {
        if (!branchId) { errors.push({ row: rowNum, name: r.name, error: "Product created, but opening stock skipped (no branch selected)" }); continue }
        if (!r.expiry_date) { errors.push({ row: rowNum, name: r.name, error: "Product created, but opening stock skipped (missing expiry_date)" }); continue }
        await withTenant(ctx.organizationId, (db) => db.insert(product_batch).values({
          organization_id: ctx.organizationId, product_id: newId, branch_id: branchId!,
          batch_number: r.batch_number ?? "OPENING", expiry_date: r.expiry_date!,
          quantity_received: r.opening_qty!, quantity_remaining: r.opening_qty!,
          cost_price: r.cost_price == null ? null : String(r.cost_price), received_by: ctx.userId,
        }))
        stockBatches++
      }
    } catch (e) {
      errors.push({ row: rowNum, name: r.name, error: e instanceof Error ? e.message : "Failed to create product" })
    }
  }

  return NextResponse.json({ created, stockBatches, failed: errors.length, total: parsed.data.rows.length, errors: errors.slice(0, 100) })
}
