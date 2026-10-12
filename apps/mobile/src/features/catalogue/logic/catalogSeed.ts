// Pure helpers for app/catalog-seed.tsx (no RN imports — vitest). Shape
// mirrors apps/web/app/api/catalog/seed/route.ts's GET `departments`.

export interface Department {
  category: string
  total: number
  seeded: number
}

export function seedTotals(departments: Department[]): { total: number; seeded: number; remaining: number } {
  let total = 0
  let seeded = 0
  for (const d of departments) {
    total += d.total
    seeded += Math.min(d.seeded, d.total)
  }
  return { total, seeded, remaining: total - seeded }
}

export function isDepartmentDone(d: Department): boolean {
  return d.seeded >= d.total
}

/** "Added 12 products, updated 3" — the toast after a seed. */
export function seedResultMessage(seeded: number, updated: number): string {
  return `Added ${seeded} product${seeded === 1 ? "" : "s"}${updated ? `, updated ${updated}` : ""}`
}

/** "Removed 5 products (kept 2 already in use)" — the toast after unseed. */
export function unseedResultMessage(removed: number, kept: number): string {
  return `Removed ${removed} product${removed === 1 ? "" : "s"}${kept ? ` (kept ${kept} already in use)` : ""}`
}
