"use client"

import { useEffect, useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const

/** Compact icon dropdown for the top bars. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  // Mount guard avoids a hydration mismatch (theme is only known client-side).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  const Icon = mounted && resolvedTheme === "dark" ? Moon : Sun

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Toggle theme"
        className={`relative w-9 h-9 rounded-lg border border-[var(--pt-border)] flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] transition-colors ${className}`}
      >
        <Icon size={16} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onClick={() => setTheme(o.value)}
            className={`gap-2 ${mounted && theme === o.value ? "bg-[var(--pt-green-50)] text-[var(--pt-green-600)]" : ""}`}
          >
            <o.icon size={15} />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Labeled 3-way segmented control for the Settings page. */
export function ThemeSegmented() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  // Mount guard avoids a hydration mismatch (theme is only known client-side).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  return (
    <div className="inline-flex rounded-lg border border-[var(--pt-border)] p-1 bg-[var(--pt-muted)]">
      {OPTIONS.map((o) => {
        const active = mounted && theme === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setTheme(o.value)}
            className={`flex items-center gap-1.5 px-3 h-8 rounded-md text-[13px] font-medium transition-colors ${
              active
                ? "bg-[var(--pt-surface)] text-[var(--pt-text)] shadow-sm"
                : "text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]"
            }`}
          >
            <o.icon size={14} />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
