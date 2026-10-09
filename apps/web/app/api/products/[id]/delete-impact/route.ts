import { NextResponse } from "next/server"
import { withTenant } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { getDeleteImpact } from "@/lib/products/permanentDelete"

// What deleting this product would touch — drives the delete dialog
// ("3 batches · 120 units on hand · 48 sales lines …").
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext({ permission: "products.delete" })
  if ("error" in ctx) return ctx.error
  const impact = await withTenant(ctx, (db) => getDeleteImpact(db, id))
  return NextResponse.json({
    impact,
    canDeletePermanently: ctx.permissions.includes("products.delete_permanent") && !ctx.branchLocked,
  })
}
