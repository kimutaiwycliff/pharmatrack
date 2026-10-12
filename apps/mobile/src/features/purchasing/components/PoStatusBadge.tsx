import { StatusBadge } from "../../../components"
import { PO_STATUS_LABEL, poBadgeStatus } from "../logic/status"
import type { PoStatus } from "../logic/types"

/** Web's PoStatusBadge labels on the shared StatusBadge colours. */
export function PoStatusBadge({ status }: { status: PoStatus }) {
  return <StatusBadge status={poBadgeStatus(status)} label={PO_STATUS_LABEL[status]} />
}
