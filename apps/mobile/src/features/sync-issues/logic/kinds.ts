import { formatKES } from "@pharmatrack/core"
import { formatDateTime } from "../../../lib/dates"

// R3: what each sync issue kind means, in the same words as the web inbox
// (apps/web/app/(dashboard)/sync-issues/page.tsx KINDS). Detail fields follow
// what apps/web/lib/sync/push.ts writes for each kind. Pure (no RN) — icons are
// Ionicons glyph names, resolved by the screen.

/** GET /api/sync-issues row (apps/web/app/api/sync-issues/route.ts). */
export interface SyncIssue {
  id: string
  kind: string
  status: "open" | "resolved" | string
  details: Record<string, unknown>
  created_at: string
  sale_id: string | null
  shift_id: string | null
  product_id: string | null
  resolved_at: string | null
  resolution_note: string | null
  device_name: string | null
  device_code: string | null
  receipt: string | null
  product_name: string | null
  branch_name: string | null
}

export type IssueTone = "danger" | "warning" | "info"

export interface IssueKindInfo {
  label: string
  icon: string
  tone: IssueTone
  help: string
  describe: (i: SyncIssue) => string
}

// details carry KES decimals (not cents) — same as the web's formatKES(Number(…)).
const kes = (v: unknown) => formatKES(Math.round(Number(v ?? 0) * 100))

export const ISSUE_KINDS: Record<string, IssueKindInfo> = {
  oversell: {
    label: "Sold more than the shelf",
    icon: "cube-outline",
    tone: "danger",
    help: "Stock was removed on the web (e.g. a write-off) while the device was offline and had already sold it. Recount and adjust.",
    describe: (i) => `${String(i.details.product_name ?? i.product_name ?? "Item")}: ${String(i.details.unbacked)} of ${String(i.details.sold)} sold with no stock left`,
  },
  price_mismatch: {
    label: "Different price charged",
    icon: "pricetag-outline",
    tone: "warning",
    help: "The device sold at its last-synced price; the price has since changed. The sale keeps what the customer actually paid.",
    describe: (i) =>
      `${String(i.details.product_name ?? "Item")}: charged ${kes(i.details.charged_unit_price)} vs current ${kes(i.details.current_unit_price)} × ${String(i.details.quantity)}`,
  },
  mpesa_unverified: {
    label: "M-Pesa to confirm",
    icon: "phone-portrait-outline",
    tone: "warning",
    help: "Recorded offline from a till/paybill code. Check it against your M-Pesa statement, then resolve.",
    describe: (i) => `${kes(i.details.amount)}${i.details.reference ? ` · code ${String(i.details.reference)}` : " · no code entered"}`,
  },
  late_sync: {
    label: "Synced after midnight",
    icon: "time-outline",
    tone: "warning",
    help: "A sale reached the server after its day's deadline. Usually a missed sync — check the device is syncing nightly.",
    describe: (i) => `Sold ${formatDateTime(String(i.details.sold_at))}${i.details.override_client_id ? " · under a manager override" : ""}`,
  },
  override_used: {
    label: "Manager unlocked a device",
    icon: "key-outline",
    tone: "info",
    help: "Selling was unlocked with a manager PIN after a missed midnight sync.",
    describe: (i) =>
      `${Number(i.details.pending_sales ?? 0)} sales were waiting${i.details.manager_permitted === false ? " · this person isn't allowed to override" : ""}`,
  },
  shift_conflict: {
    label: "Shift auto-closed",
    icon: "people-outline",
    tone: "info",
    help: "The same person opened a shift on a device while one was still open elsewhere; the older shift was closed.",
    describe: () => "An older open shift was closed automatically",
  },
  rejected_sale: {
    label: "Sale couldn't be recorded",
    icon: "close-circle-outline",
    tone: "danger",
    help: "The full sale is saved here. Record it manually if it really happened (e.g. the cashier lost access mid-shift).",
    describe: (i) => {
      const p = i.details.payload as { total_amount?: number; receipt_number?: string } | undefined
      const parts = [p?.receipt_number, p?.total_amount != null ? kes(p.total_amount) : null].filter(Boolean).join(" ")
      const why = String(i.details.message ?? i.details.code ?? "")
      return [parts, why].filter(Boolean).join(" — ")
    },
  },
}

export function issueKind(kind: string): IssueKindInfo {
  return ISSUE_KINDS[kind] ?? { label: kind, icon: "alert-circle-outline", tone: "warning", help: "", describe: () => "" }
}

/** Device · receipt · branch · time — the web's grey meta line. */
export function issueMeta(i: SyncIssue, opts: { showBranch: boolean }): string {
  return [
    i.device_name ? `${i.device_name}${i.device_code ? ` (${i.device_code})` : ""}` : null,
    i.receipt ? `receipt ${i.receipt}` : null,
    opts.showBranch ? i.branch_name : null,
    formatDateTime(i.created_at),
  ]
    .filter(Boolean)
    .join(" · ")
}
