"use client"

import { useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { FEATURE_LABELS, CAPABILITIES, isCapability, type Feature } from "@pharmatrack/core"

// Mounted once in the dashboard layout; shows an upgrade toast when a plan
// gate redirects here with ?locked=<feature>, or a role-permission gate with
// ?denied=<capability>.
export function LockedNotice() {
  const params = useSearchParams()
  const locked = params.get("locked")
  const denied = params.get("denied")
  const shown = useRef<string | null>(null)
  const shownDenied = useRef<string | null>(null)

  useEffect(() => {
    if (!denied || shownDenied.current === denied) return
    shownDenied.current = denied
    const name = isCapability(denied) ? CAPABILITIES[denied].label : "That page"
    toast.info(`You don’t have access to “${name}”.`, {
      description: "Ask the pharmacy owner to enable it in Settings → Roles & permissions.",
    })
  }, [denied])

  useEffect(() => {
    if (!locked || shown.current === locked) return
    shown.current = locked
    const name = FEATURE_LABELS[locked as Feature] ?? "That feature"
    toast.info(`${name} isn’t included in your current plan.`, {
      description: "Upgrade your plan in Settings → Billing to unlock it.",
    })
  }, [locked])

  return null
}
