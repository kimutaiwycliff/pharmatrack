"use client"

import { ClipboardList, Banknote } from "lucide-react"
import type { StationMode } from "@/lib/cashier-station/client"

// Asked once per computer in a branch that pays at a cashier station (ADR-021).
export function StationModePicker({ branchName, onPick }: { branchName: string; onPick: (mode: StationMode) => void }) {
  const option = (mode: StationMode, Icon: typeof Banknote, title: string, body: string) => (
    <button
      onClick={() => onPick(mode)}
      className="flex-1 min-w-[220px] text-left rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-surface)] p-5 hover:border-[var(--pt-green)] hover:bg-[var(--pt-green-50)] transition-colors"
    >
      <Icon size={22} className="text-[var(--pt-green-600)]" />
      <div className="mt-3 font-bold">{title}</div>
      <p className="mt-1 text-sm text-[var(--pt-text-secondary)]">{body}</p>
    </button>
  )
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--pt-bg)] p-4">
      <div className="w-full max-w-xl">
        <h1 className="text-xl font-bold">What is this computer?</h1>
        <p className="mt-1 text-sm text-[var(--pt-text-secondary)]">
          {branchName} pays at a cashier station. You can change this later from the top bar.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {option("desk", ClipboardList, "Order desk", "Serve customers and send their orders to the cashier. No cash drawer, no clock-in.")}
          {option("cashier", Banknote, "Cashier", "Take payment for orders — cash, M-Pesa or card — and hand the goods over.")}
        </div>
      </div>
    </div>
  )
}
