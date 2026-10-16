"use client"

import Link from "next/link"
import { Printer, ScanBarcode } from "lucide-react"
import type { DeviceHealth, DeviceTone } from "@pharmatrack/core"
import { useDeviceHealth } from "@/lib/printing/useDeviceHealth"

const TONE: Record<DeviceTone, { dot: string; pill: string }> = {
  ok: { dot: "bg-[var(--pt-green)]", pill: "text-[var(--pt-text-secondary)]" },
  warn: { dot: "bg-amber-500", pill: "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200" },
  down: { dot: "bg-[var(--pt-red)]", pill: "bg-[var(--pt-red-50)] text-[var(--pt-red)]" },
  none: { dot: "bg-[var(--pt-border-strong)]", pill: "text-[var(--pt-text-tertiary)]" },
}

function Pill({ icon: Icon, health }: { icon: React.ElementType; health: DeviceHealth }) {
  const t = TONE[health.tone]
  return (
    <Link
      href="/settings?tab=hardware"
      title={[health.label, health.detail].filter(Boolean).join(" — ")}
      aria-label={`${health.label}. ${health.detail ?? ""} Open printer and scanner settings.`}
      className={`flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs font-semibold hover:bg-[var(--pt-muted)] transition-colors ${t.pill}`}
    >
      <span className="relative">
        <Icon size={15} />
        <span className={`absolute -right-0.5 -bottom-0.5 w-2 h-2 rounded-full ring-2 ring-[var(--pt-surface)] ${t.dot}`} />
      </span>
      {/* When all is well the dot says it; problems always spell themselves out. */}
      {health.tone === "ok" || health.tone === "none" ? null : <span className="hidden sm:inline">{health.label}</span>}
    </Link>
  )
}

/** POS header: is the receipt printer ready, and is the scanner working? */
export function DeviceStatusBadges() {
  const { printer, scanner, direct } = useDeviceHealth()
  return (
    <div className="flex items-center gap-0.5">
      {direct ? <Pill icon={Printer} health={printer} /> : null}
      <Pill icon={ScanBarcode} health={scanner} />
    </div>
  )
}
