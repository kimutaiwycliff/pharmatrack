"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { driver, type Driver } from "driver.js"
import "driver.js/dist/driver.css"
import { Lightbulb, PartyPopper, Users, Smartphone, ListChecks } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useSetupProgress } from "@/components/onboarding/SetupGuide"

// The coached first sale (ADR-019). While a pharmacy has never sold anything,
// owners and managers get short tips at the till — what the opening float is,
// where to search, where to take payment — and a small celebration after the
// first receipt. Tips react to what's on screen instead of running one long
// tour, and can be switched off.

const OFF_KEY = "pt-pos-coach-off"

function coachOff(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === "1"
  } catch {
    return false
  }
}
function setCoachOff() {
  try {
    localStorage.setItem(OFF_KEY, "1")
  } catch {
    // storage blocked — the tips just come back next time
  }
}

/** True while this owner/manager's pharmacy hasn't made its first sale. */
function useFirstSaleMode(): boolean {
  const { data } = useSetupProgress()
  const step = data?.audience ? data.progress?.steps.find((s) => s.key === "first_sale") : undefined
  return !!step && !step.done
}

/** Explains the opening float on the start-shift screens. */
export function FirstShiftTip() {
  const first = useFirstSaleMode()
  if (!first) return null
  return (
    <div className="flex gap-2.5 rounded-lg border border-[var(--pt-green-100)] bg-[var(--pt-green-50)] px-3 py-2.5 text-xs text-[var(--pt-text-secondary)]">
      <Lightbulb size={15} className="shrink-0 mt-0.5 text-[var(--pt-green-600)]" />
      <p>
        <span className="font-semibold text-[var(--pt-text)]">Your first shift.</span> The opening float is the cash already in the
        drawer — count it and type it in (0 if it&apos;s empty). When you end the shift you count again, and PharmaTrack shows any difference.
      </p>
    </div>
  )
}

/** Points at the next thing to do at the till: search when the cart is empty, pay when it isn't. */
export function PosCoach({ cartCount, paused }: { cartCount: number; paused: boolean }) {
  const first = useFirstSaleMode()
  const [off, setOff] = useState(true)
  const tour = useRef<Driver | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setOff(coachOff()), 0)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    tour.current?.destroy()
    tour.current = null
    if (!first || off || paused) return
    const target = cartCount === 0 ? "#pos-search" : "#pos-pay"
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(target)
      // On phones the cart (and its pay buttons) lives in a sheet — only point at what's visible.
      if (!el || el.offsetParent === null) return
      const d = driver({
        popoverClass: "pt-coach",
        overlayOpacity: 0.35,
        stagePadding: 6,
        stageRadius: 12,
        allowClose: true,
        showButtons: ["close"],
        onCloseClick: () => {
          setCoachOff()
          setOff(true)
          d.destroy()
        },
      })
      d.highlight({
        element: target,
        popover: cartCount === 0
          ? { title: "1 · Find a product", description: "Type a name or scan a barcode, then tap the product to add it. Tap × to hide these tips.", side: "bottom", align: "start" }
          : { title: "2 · Take payment", description: "Choose how the customer pays — try Cash. You'll get a receipt to print or share.", side: "top", align: "center" },
      })
      tour.current = d
      // Once they start typing, get out of the way — the tip would cover the
      // results they need to tap. It comes back for the payment step.
      if (cartCount === 0) {
        const input = document.querySelector<HTMLInputElement>("#pos-search")
        const away = () => { d.destroy(); tour.current = null }
        input?.addEventListener("input", away, { once: true })
        cleanupInput = () => input?.removeEventListener("input", away)
      }
    }, 400)
    let cleanupInput: (() => void) | null = null
    return () => {
      clearTimeout(t)
      cleanupInput?.()
      tour.current?.destroy()
      tour.current = null
    }
  }, [first, off, paused, cartCount])

  return null
}

/** After the first receipt closes: a moment to celebrate, and what to do next. */
export function FirstSaleCelebration({ receiptOpen }: { receiptOpen: boolean }) {
  const qc = useQueryClient()
  const first = useFirstSaleMode()
  const wasFirst = useRef(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Remember that the receipt on screen is the pharmacy's first sale…
    if (receiptOpen && first) wasFirst.current = true
    // …and celebrate when it closes.
    if (!receiptOpen && wasFirst.current) {
      wasFirst.current = false
      const t = setTimeout(() => {
        setOpen(true)
        void qc.invalidateQueries({ queryKey: ["setup-progress"] })
      }, 0)
      return () => clearTimeout(t)
    }
  }, [receiptOpen, first, qc])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md text-center">
        <DialogHeader className="items-center">
          <div className="w-14 h-14 rounded-full bg-[var(--pt-green-50)] flex items-center justify-center mx-auto">
            <PartyPopper size={28} className="text-[var(--pt-green-600)]" />
          </div>
          <DialogTitle className="text-xl mt-2">Your first sale!</DialogTitle>
          <DialogDescription>Your pharmacy is selling on PharmaTrack. Here&apos;s what most pharmacies do next:</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 text-left">
          <Link href="/staff" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg border border-[var(--pt-border)] p-3 hover:border-[var(--pt-green)]">
            <Users size={17} className="text-[var(--pt-green-600)] shrink-0" />
            <span className="text-sm"><span className="font-semibold">Invite your staff</span><span className="block text-xs text-[var(--pt-text-secondary)]">Each gets their own till PIN</span></span>
          </Link>
          <Link href="/settings?tab=payments" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg border border-[var(--pt-border)] p-3 hover:border-[var(--pt-green)]">
            <Smartphone size={17} className="text-[var(--pt-green-600)] shrink-0" />
            <span className="text-sm"><span className="font-semibold">Take M-Pesa at the till</span><span className="block text-xs text-[var(--pt-text-secondary)]">Payment prompts straight to the customer&apos;s phone</span></span>
          </Link>
          <Link href="/getting-started" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg border border-[var(--pt-border)] p-3 hover:border-[var(--pt-green)]">
            <ListChecks size={17} className="text-[var(--pt-green-600)] shrink-0" />
            <span className="text-sm"><span className="font-semibold">See everything else</span><span className="block text-xs text-[var(--pt-text-secondary)]">Receipts, offline tills and more</span></span>
          </Link>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="mt-1 text-sm font-medium text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]">Keep selling</button>
      </DialogContent>
    </Dialog>
  )
}
