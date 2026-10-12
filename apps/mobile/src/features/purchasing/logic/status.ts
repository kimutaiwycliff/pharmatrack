import type { PoStatus } from "./types"

// Status filters + labels exactly as web's purchase-orders page and
// PoStatusBadge (apps/web/components/purchasing/PoStatusBadge.tsx). "open" is
// the API's shorthand for draft + sent + partially received.

export const PO_FILTERS = [
  { key: "open", label: "Open" },
  { key: "draft", label: "Drafts" },
  { key: "sent", label: "Sent" },
  { key: "partially_received", label: "Partly received" },
  { key: "received", label: "Received" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
] as const

export type PoFilter = (typeof PO_FILTERS)[number]["key"]

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_received: "Partly received",
  received: "Received",
  cancelled: "Cancelled",
}

/** StatusBadge colour for a PO status. */
export function poBadgeStatus(status: PoStatus): "ok" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "received":
      return "ok"
    case "partially_received":
      return "warning"
    case "cancelled":
      return "danger"
    default:
      return "neutral"
  }
}

/** Web rule: a delivery can be checked in until the order is received/cancelled. */
export function canReceiveStatus(status: PoStatus): boolean {
  return status === "draft" || status === "sent" || status === "partially_received"
}

/** Web rule: cancel is offered for orders already with the supplier; drafts are deleted instead. */
export function canCancelStatus(status: PoStatus): boolean {
  return status === "sent" || status === "partially_received"
}
