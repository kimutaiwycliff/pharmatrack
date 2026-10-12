// Inventory status filters and badges — the `status` query param values of
// GET /api/inventory (apps/web/app/api/inventory/route.ts getStatus()). "ok"
// is a badge but not a filter. Dashboard links to /inventory?status=… with
// these same values.

export type StatusFilter = "all" | "low_stock" | "out_of_stock" | "expiring" | "controlled"

export const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "low_stock", label: "Low stock" },
  { key: "out_of_stock", label: "Out of stock" },
  { key: "expiring", label: "Expiring ≤90d" },
  { key: "controlled", label: "Controlled" },
]

/** Route param → filter (anything unknown → "all"). */
export function parseStatusParam(value: string | string[] | undefined | null): StatusFilter {
  const v = Array.isArray(value) ? value[0] : value
  return STATUS_FILTERS.some((f) => f.key === v) ? (v as StatusFilter) : "all"
}

export function badgeFor(code: string): { status: "ok" | "warning" | "danger" | "neutral"; label: string } {
  switch (code) {
    case "out_of_stock":
      return { status: "danger", label: "Out of stock" }
    case "low_stock":
      return { status: "warning", label: "Low stock" }
    case "expiring":
      return { status: "warning", label: "Expiring" }
    case "controlled":
      return { status: "neutral", label: "Controlled" }
    default:
      return { status: "ok", label: "In stock" }
  }
}

/** Badges worth showing on a row ("ok" is implied by the absence of others). */
export function visibleBadges(codes: readonly string[]): string[] {
  return codes.filter((c) => c !== "ok")
}
