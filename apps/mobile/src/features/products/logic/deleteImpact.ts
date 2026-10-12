// Pure logic behind the "Remove product" sheet — mirrors web's
// components/inventory/DeleteProductDialog.tsx: an unused product gets a plain
// delete; one with history recommends Deactivate (reversible, keeps history)
// and, only for products.delete_permanent with the org-wide view, offers a
// typed-name permanent delete. Copy is web's, word for word where possible.

export interface ImpactCounts {
  batches: number
  unitsOnHand: number
  saleLines: number
  adjustments: number
  prescriptionLines: number
  clean: boolean
}

export function countLabel(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-KE")} ${n === 1 ? one : many}`
}

/** "3 batches · 120 units on hand", "48 sales lines" … (web's history list). */
export function historyLines(i: ImpactCounts): string[] {
  const out: string[] = []
  if (i.batches > 0) out.push(`${countLabel(i.batches, "batch", "batches")} · ${countLabel(i.unitsOnHand, "unit")} on hand`)
  if (i.saleLines > 0) out.push(countLabel(i.saleLines, "sales line"))
  if (i.adjustments > 0) out.push(countLabel(i.adjustments, "stock adjustment"))
  if (i.prescriptionLines > 0) out.push(countLabel(i.prescriptionLines, "prescription line"))
  return out
}

/** What a permanent delete erases. */
export function erasedLines(i: ImpactCounts): string[] {
  const out = ["The product, its pack sizes and barcode"]
  if (i.batches > 0) {
    out.push(`${countLabel(i.batches, "batch", "batches")}${i.unitsOnHand > 0 ? ` — including ${countLabel(i.unitsOnHand, "unit")} still on hand` : ""}`)
  }
  if (i.adjustments > 0) out.push(countLabel(i.adjustments, "stock adjustment"))
  return out
}

/** What a permanent delete keeps. */
export function keptLines(i: ImpactCounts): string[] {
  const out: string[] = []
  if (i.saleLines > 0) out.push(`${countLabel(i.saleLines, "past sales line")} — receipts, revenue and profit stay correct`)
  out.push("Controlled-substance register entries")
  out.push("A full record of the product in the audit log")
  return out
}

export type DeactivateOption = "hidden" | "available" | "already"

export type RemovePlan =
  | { kind: "clean" }
  | { kind: "history"; deactivate: DeactivateOption; permanent: boolean }

/**
 * Which choices the sheet offers. `serverAllowsPermanent` is the
 * delete-impact route's `canDeletePermanently` (permission AND not
 * branch-locked) — the server's word wins, the local capability is a backstop.
 */
export function removePlan(args: {
  impact: ImpactCounts
  isActive: boolean
  canEdit: boolean
  canDeletePermanent: boolean
  serverAllowsPermanent: boolean
}): RemovePlan {
  if (args.impact.clean) return { kind: "clean" }
  const deactivate: DeactivateOption = !args.canEdit ? "hidden" : args.isActive ? "available" : "already"
  return { kind: "history", deactivate, permanent: args.canDeletePermanent && args.serverAllowsPermanent }
}

/** The typed confirmation the server checks: trimmed, case-insensitive. */
export function nameMatches(typed: string, productName: string): boolean {
  const t = typed.trim().toLowerCase()
  return t.length > 0 && t === productName.trim().toLowerCase()
}

/** A 409 body from a plain DELETE carries the impact — pull it out safely. */
export function impactFromConflict(body: unknown): ImpactCounts | null {
  if (!body || typeof body !== "object" || !("impact" in body)) return null
  const i = (body as { impact: unknown }).impact
  if (!i || typeof i !== "object") return null
  const r = i as Record<string, unknown>
  const n = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : 0)
  return {
    batches: n("batches"),
    unitsOnHand: n("unitsOnHand"),
    saleLines: n("saleLines"),
    adjustments: n("adjustments"),
    prescriptionLines: n("prescriptionLines"),
    clean: r.clean === true,
  }
}
