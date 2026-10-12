// Pure helpers for app/inventory-import.tsx's preview (no RN imports — vitest).
//
// The server (apps/web/app/api/inventory/import/route.ts) does the real
// validation per row; this only flags the two required columns so the user
// sees obviously broken rows before uploading. Rows flagged here are still
// sent — the server reports them back as failed, same as before.

export type PreviewIssue = "missing_name" | "missing_price" | "bad_price"

export interface PreviewRow {
  /** 1-based data row number (header excluded), as the server reports it. */
  row: number
  name: string
  price: string
  issues: PreviewIssue[]
}

export interface ImportPreview {
  rows: PreviewRow[]
  /** Rows with at least one issue. */
  flagged: number
}

/** Mirrors the API's selling_price rule: z.coerce.number().positive(). */
function priceIssue(raw: string): PreviewIssue | null {
  const t = raw.trim()
  if (!t) return "missing_price"
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? null : "bad_price"
}

export function buildImportPreview(records: Record<string, string>[]): ImportPreview {
  let flagged = 0
  const rows = records.map((r, i) => {
    const name = (r.name ?? "").trim()
    const price = (r.selling_price ?? "").trim()
    const issues: PreviewIssue[] = []
    if (!name) issues.push("missing_name")
    const p = priceIssue(price)
    if (p) issues.push(p)
    if (issues.length) flagged++
    return { row: i + 1, name, price, issues }
  })
  return { rows, flagged }
}

export function issueLabel(issue: PreviewIssue): string {
  switch (issue) {
    case "missing_name":
      return "No name"
    case "missing_price":
      return "No selling price"
    case "bad_price":
      return "Price must be above 0"
  }
}

/** Required headers missing from the parsed file (empty = OK). */
export function missingRequiredColumns(first: Record<string, string> | undefined): string[] {
  if (!first) return ["name", "selling_price"]
  return ["name", "selling_price"].filter((h) => !(h in first))
}
