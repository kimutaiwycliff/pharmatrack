import { apiJson, withQuery } from "../../lib/api"
import type { CallAction, CallList } from "./logic/callList"

// Online edition only (the call list needs the server): the dashboard card
// never builds a query key in the Offline Edition, so these aren't reached.
// Endpoints: apps/web/app/api/appointments/{call-list,[id]/contact,[id]}.

export const callListPath = (branchId: string | undefined) => withQuery("/api/appointments/call-list", { branch_id: branchId })

export function fetchCallList(path: string): Promise<CallList> {
  return apiJson<CallList>(path)
}

/** Called / No answer → POST …/contact; Confirmed → PATCH the booking's status. */
export async function recordCallAction(id: string, action: CallAction): Promise<void> {
  if (action === "confirmed") {
    await apiJson(`/api/appointments/${id}`, { method: "PATCH", body: { status: "confirmed" } })
    return
  }
  await apiJson(`/api/appointments/${id}/contact`, { method: "POST", body: { outcome: action } })
}
