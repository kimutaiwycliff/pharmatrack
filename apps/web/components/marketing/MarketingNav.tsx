"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Menu, X, Cross } from "lucide-react"

const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/guide", label: "Guide" },
  { href: "/#faq", label: "FAQ" },
  { href: "/blog", label: "Blog" },
]

export function MarketingNav({ signedIn }: { signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[var(--pt-surface)]/85 backdrop-blur-xl border-b border-[var(--pt-border)]"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <nav className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="relative grid place-items-center w-8 h-8 rounded-lg bg-[var(--pt-green)] text-white shadow-sm shadow-[var(--pt-green)]/30">
            <Cross size={16} strokeWidth={2.5} className="rotate-0 group-hover:rotate-90 transition-transform duration-300" />
          </span>
          <span className="font-[family-name:var(--font-display)] text-lg font-extrabold tracking-tight">PharmaTrack</span>
        </Link>

        <div className="hidden md:flex items-center gap-7">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)] transition-colors">
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          {signedIn ? (
            <Link href="/home" className="text-sm font-semibold px-4 h-9 inline-flex items-center rounded-lg bg-[var(--pt-green-cta)] text-white hover:bg-[var(--pt-green)] transition-colors">
              Go to app
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-sm font-semibold px-4 h-9 inline-flex items-center rounded-lg text-[var(--pt-text)] hover:bg-[var(--pt-muted-strong)] transition-colors">
                Sign in
              </Link>
              <Link href="/signup" className="text-sm font-semibold px-4 h-9 inline-flex items-center rounded-lg bg-[var(--pt-green-cta)] text-white hover:bg-[var(--pt-green)] transition-colors shadow-sm shadow-[var(--pt-green)]/30">
                Start free trial
              </Link>
            </>
          )}
        </div>

        <button className="md:hidden p-2 -mr-2 text-[var(--pt-text)]" onClick={() => setOpen((o) => !o)} aria-label="Menu">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {open && (
        <div className="md:hidden border-t border-[var(--pt-border)] bg-[var(--pt-surface)] px-5 py-4 space-y-1">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-2.5 text-sm font-medium text-[var(--pt-text-secondary)]">
              {l.label}
            </a>
          ))}
          <div className="pt-3 flex flex-col gap-2">
            {signedIn ? (
              <Link href="/home" className="text-center text-sm font-semibold py-2.5 rounded-lg bg-[var(--pt-green-cta)] text-white">Go to app</Link>
            ) : (
              <>
                <Link href="/login" className="text-center text-sm font-semibold py-2.5 rounded-lg border border-[var(--pt-border)]">Sign in</Link>
                <Link href="/signup" className="text-center text-sm font-semibold py-2.5 rounded-lg bg-[var(--pt-green-cta)] text-white">Start free trial</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
