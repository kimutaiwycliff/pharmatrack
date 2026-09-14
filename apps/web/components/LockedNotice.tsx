"use client"

import { useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { FEATURE_LABELS, type Feature } from "@pharmatrack/core"

// Mounted once in the dashboard layout; shows an upgrade toast when a plan
// gate redirects here with ?locked=<feature>.
export function LockedNotice() {
  const locked = useSearchParams().get("locked")
  const shown = useRef<string | null>(null)

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
