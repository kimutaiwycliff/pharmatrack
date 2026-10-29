"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useHydrated } from "@/lib/hooks/useHydrated"
import { isDesktopApp } from "@/lib/till/device"

// "Back to home" on the sign-in screen → the landing page. Hidden in the
// desktop app, which opens straight to sign-in and has no use for the
// marketing site.
export function HomeLink() {
  const hydrated = useHydrated()
  if (hydrated && isDesktopApp()) return null
  return (
    <Link
      href="/"
      className="absolute top-5 left-5 z-10 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)] hover:bg-[var(--pt-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pt-green)]"
    >
      <ArrowLeft size={16} aria-hidden />
      Back to home
    </Link>
  )
}
