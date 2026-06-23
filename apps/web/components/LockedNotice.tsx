"use client"

import { useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import type { Feature } from "@pharmatrack/core"

// Labels for the upgrade toast shown when a plan gate redirects here with
// ?locked=<feature>. Mounted once in the dashboard layout.
const LABELS: Partial<Record<Feature, string>> = {
  appointments: "Appointments & reminders",
  reminders: "Appointment reminders",
  prescriptions: "Prescriptions & DUR",
  reports: "Reports & analytics",
  multi_branch: "Multiple branches",
  central_reporting: "Centralised reporting",
}

export function LockedNotice() {
  const locked = useSearchParams().get("locked")
  const shown = useRef<string | null>(null)

  useEffect(() => {
    if (!locked || shown.current === locked) return
    shown.current = locked
    const name = LABELS[locked as Feature] ?? "That feature"
    toast.info(`${name} isn’t included in your current plan.`, {
      description: "Upgrade your plan in Settings → Billing to unlock it.",
    })
  }, [locked])

  return null
}
