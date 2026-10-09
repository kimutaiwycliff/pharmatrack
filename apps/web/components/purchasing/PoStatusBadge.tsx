import type { PoStatus } from "@/lib/purchasing/serialize"

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_received: "Partly received",
  received: "Received",
  cancelled: "Cancelled",
}

const STYLE: Record<PoStatus, string> = {
  draft: "bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)]",
  sent: "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  partially_received: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  received: "bg-[var(--pt-green-50)] text-[var(--pt-green-600)]",
  cancelled: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300",
}

export function PoStatusBadge({ status }: { status: PoStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${STYLE[status]}`}>
      {PO_STATUS_LABEL[status]}
    </span>
  )
}
