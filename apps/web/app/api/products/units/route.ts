import { NextResponse } from "next/server"
import { isNotNull } from "drizzle-orm"
import { withTenant, product } from "@pharmatrack/db"
import { getTenantContext } from "@/lib/auth/helpers"

// Distinct base_unit / dosage_form values already used by this org's products —
// feeds the "create your own" combobox in NewProductDialog / EditProductSheet so
// a custom value typed by one teammate is discoverable (not silently re-typed
// with different spelling) by the next.
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { base_units, dosage_forms } = await withTenant(ctx, async (db) => {
    const [baseUnitRows, dosageFormRows] = await Promise.all([
      db.select({ v: product.base_unit }).from(product).where(isNotNull(product.base_unit)).groupBy(product.base_unit),
      db.select({ v: product.dosage_form }).from(product).where(isNotNull(product.dosage_form)).groupBy(product.dosage_form),
    ])
    return {
      base_units: baseUnitRows.map((r) => r.v).filter((v): v is string => !!v),
      dosage_forms: dosageFormRows.map((r) => r.v).filter((v): v is string => !!v),
    }
  })

  return NextResponse.json({ base_units, dosage_forms })
}
