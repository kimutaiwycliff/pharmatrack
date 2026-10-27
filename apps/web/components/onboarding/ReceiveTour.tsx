"use client"

import { useEffect } from "react"
import { driver } from "driver.js"
import "driver.js/dist/driver.css"
import { useSetupProgress } from "@/components/onboarding/SetupGuide"

// "Show me" for the Add-your-stock step (ADR-019): a four-stop walkthrough of
// Receive stock. Runs once on this computer while the pharmacy has no stock
// yet, and again whenever the page is opened with ?tour=1.

const SEEN_KEY = "pt-tour-receive"

export function ReceiveTour() {
  const { data } = useSetupProgress()
  const stockStep = data?.audience ? data.progress?.steps.find((s) => s.key === "stock") : undefined

  useEffect(() => {
    if (!data) return
    const asked = new URLSearchParams(window.location.search).get("tour") === "1"
    let seen = false
    try { seen = localStorage.getItem(SEEN_KEY) === "1" } catch { /* storage blocked */ }
    const firstTime = !!stockStep && !stockStep.done && !seen
    if (!asked && !firstTime) return

    const t = setTimeout(() => {
      if (!document.querySelector('[data-tour="receive-find"]')) return
      try { localStorage.setItem(SEEN_KEY, "1") } catch { /* storage blocked */ }
      driver({
        popoverClass: "pt-coach",
        overlayOpacity: 0.35,
        stagePadding: 6,
        stageRadius: 12,
        showProgress: true,
        progressText: "{{current}} of {{total}}",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Got it",
        steps: [
          { element: '[data-tour="receive-find"]', popover: { title: "Find the product", description: "Scan the box barcode, or search by name below. New products can be added straight from here.", side: "bottom", align: "start" } },
          { element: '[data-tour="receive-batch"]', popover: { title: "Batch, expiry and quantity", description: "Copy the batch number and expiry date from the pack, and count how many units (tablets, bottles…) you have.", side: "bottom", align: "start" } },
          { element: '[data-tour="receive-save"]', popover: { title: "Add it to the list", description: "Do this for each product on the shelf or the delivery note.", side: "top", align: "center" } },
          { element: '[data-tour="receive-post"]', popover: { title: "Post it", description: "Saves everything on the list as stock. The till always sells the earliest expiry first.", side: "top", align: "center" } },
        ],
      }).drive()
    }, 600)
    return () => clearTimeout(t)
  }, [data, stockStep])

  return null
}
