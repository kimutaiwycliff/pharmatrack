"use client"

import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Check, ChevronRight, Clock, EyeOff, MessageCircle, PlayCircle, Rocket, Sparkles } from "lucide-react"
import type { SetupProgress, SetupStep } from "@pharmatrack/core"
import { Button } from "@/components/ui/button"

// Setup guide (ADR-019). One data source, two layouts: a compact card at the
// top of the dashboard until the pharmacy has made its first sale, and the
// full /getting-started page (always reachable from the sidebar).

export interface SetupGuideData { audience: boolean; hidden?: boolean; progress?: SetupProgress }

const HELP_LINK = `https://wa.me/254756412487?text=${encodeURIComponent("Hi! I'm setting up my pharmacy on PharmaTrack and need a hand.")}`

export function useSetupProgress() {
  return useQuery<SetupGuideData>({
    queryKey: ["setup-progress"],
    queryFn: async () => {
      const res = await fetch("/api/onboarding/progress")
      if (!res.ok) return { audience: false }
      return res.json() as Promise<SetupGuideData>
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

/** Progress ring: done / total, with the count in the middle. */
export function ProgressRing({ done, total, size = 52 }: { done: number; total: number; size?: number }) {
  const stroke = size > 40 ? 5 : 3.5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = total ? done / total : 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${done} of ${total} steps done`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--pt-muted-strong)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--pt-green)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="transition-[stroke-dashoffset] duration-700 ease-out" />
      </svg>
      {size > 40 && (
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">{done}/{total}</span>
      )}
    </div>
  )
}

function StepRow({ step, index, open }: { step: SetupStep; index: number; open: boolean }) {
  return (
    <li className={`rounded-xl border transition-colors ${open ? "border-[var(--pt-green)] bg-[var(--pt-surface)] shadow-sm" : "border-transparent"}`}>
      <div className="flex items-start gap-3 px-3 py-2.5">
        <span className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          step.done ? "bg-[var(--pt-green)] text-white" : open ? "border-2 border-[var(--pt-green)] text-[var(--pt-green-700)]" : "border border-[var(--pt-border-strong)] text-[var(--pt-text-tertiary)]"
        }`}>
          {step.done ? <Check size={13} strokeWidth={3} /> : index || "·"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-sm font-semibold ${step.done ? "text-[var(--pt-text-secondary)]" : ""}`}>{step.title}</p>
            {step.detail && <span className="text-xs text-[var(--pt-text-tertiary)] shrink-0">{step.detail}</span>}
          </div>
          {open && (
            <div className="mt-1.5">
              <p className="text-sm text-[var(--pt-text-secondary)]">{step.why}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link href={step.action.href}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--pt-green)] px-3.5 text-sm font-semibold text-white hover:bg-[var(--pt-green-600)] transition-colors">
                  {step.action.label} <ChevronRight size={15} />
                </Link>
                {step.guide && (
                  <Link href={step.guide} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)]">
                    <PlayCircle size={15} /> See how
                  </Link>
                )}
                {step.minutes > 0 && <span className="inline-flex items-center gap-1 text-xs text-[var(--pt-text-tertiary)]"><Clock size={12} /> about {step.minutes} min</span>}
              </div>
            </div>
          )}
          {!open && !step.done && (
            <Link href={step.action.href} className="text-xs font-medium text-[var(--pt-green-700)] hover:underline">{step.action.label}</Link>
          )}
        </div>
      </div>
    </li>
  )
}

/** Compact dashboard card — only until the core steps are done, and only if not hidden. */
export function SetupGuideCard() {
  const qc = useQueryClient()
  const { data } = useSetupProgress()
  if (!data?.audience || !data.progress || data.hidden || data.progress.ready) return null
  const p = data.progress
  const core = p.steps.filter((s) => s.core)

  async function hide() {
    await fetch("/api/onboarding/progress", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden: true }) })
    toast.success("Guide hidden — it's always in Getting started in the menu")
    void qc.invalidateQueries({ queryKey: ["setup-progress"] })
  }

  return (
    <section aria-labelledby="setup-guide-title" className="mb-6 rounded-2xl border border-[var(--pt-green-100)] bg-gradient-to-br from-[var(--pt-green-50)] to-[var(--pt-surface)] p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <ProgressRing done={p.coreDone} total={p.coreTotal} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="setup-guide-title" className="text-lg font-bold tracking-tight">Get your pharmacy selling</h2>
              <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
                {p.coreDone} of {p.coreTotal} done{p.minutesLeft > 0 ? ` · about ${p.minutesLeft} minutes left` : ""}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5 text-[var(--pt-text-tertiary)] shrink-0" onClick={() => void hide()}>
              <EyeOff size={14} /> <span className="hidden sm:inline">Hide</span>
            </Button>
          </div>
        </div>
      </div>
      <ol className="mt-4 space-y-1">
        {core.map((s, i) => <StepRow key={s.key} step={s} index={i + 1} open={s.key === p.next} />)}
      </ol>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--pt-text-tertiary)]">
        <Link href="/getting-started" className="font-medium text-[var(--pt-green-700)] hover:underline">Open the full guide</Link>
        <a href={HELP_LINK} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:text-[var(--pt-text-secondary)]">
          <MessageCircle size={13} /> Stuck? Chat with us on WhatsApp
        </a>
      </div>
    </section>
  )
}

/** The full /getting-started page body. */
export function SetupGuidePage() {
  const qc = useQueryClient()
  const { data, isLoading } = useSetupProgress()
  if (isLoading) return <div className="max-w-3xl h-96 rounded-2xl bg-[var(--pt-muted-strong)] animate-pulse" />
  if (!data?.audience || !data.progress) {
    return (
      <div className="max-w-2xl rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-surface)] p-6">
        <h1 className="text-xl font-bold">Getting started</h1>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-1">Your pharmacy owner or manager sets up products and stock. To learn the till, open the <Link className="text-[var(--pt-green-700)] font-medium hover:underline" href="/guide" target="_blank">staff guide</Link>.</p>
      </div>
    )
  }
  const p = data.progress
  const core = p.steps.filter((s) => s.core)
  const extra = p.steps.filter((s) => !s.core)

  async function setHidden(hidden: boolean) {
    await fetch("/api/onboarding/progress", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden }) })
    void qc.invalidateQueries({ queryKey: ["setup-progress"] })
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-2xl border border-[var(--pt-green-100)] bg-gradient-to-br from-[var(--pt-green-50)] to-[var(--pt-surface)] p-5 sm:p-7">
        <div className="flex items-center gap-4">
          <ProgressRing done={p.coreDone} total={p.coreTotal} size={64} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              {p.ready ? <><Rocket size={22} className="text-[var(--pt-green-600)]" /> Your pharmacy is selling</> : "Get your pharmacy selling"}
            </h1>
            <p className="text-sm text-[var(--pt-text-secondary)] mt-1">
              {p.ready
                ? "You've added products and stock and made your first sale. Here's what makes PharmaTrack even more useful."
                : `${p.coreDone} of ${p.coreTotal} done · about ${p.minutesLeft} minutes left. Each step ticks itself off as you go.`}
            </p>
          </div>
        </div>
        <ol className="mt-5 space-y-1">
          {core.map((s, i) => <StepRow key={s.key} step={s} index={i + 1} open={s.key === p.next} />)}
        </ol>
      </div>

      <div className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-surface)] p-5 sm:p-7">
        <h2 className="text-lg font-bold flex items-center gap-2"><Sparkles size={18} className="text-[var(--pt-green-600)]" /> Make it yours</h2>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">Optional — do these whenever you&apos;re ready.</p>
        <ul className="mt-4 space-y-1">
          {extra.map((s) => <StepRow key={s.key} step={s} index={0} open={p.ready && s.key === p.next} />)}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <a href={HELP_LINK} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 font-medium text-[var(--pt-green-700)] hover:underline">
          <MessageCircle size={15} /> Stuck? Chat with us on WhatsApp
        </a>
        <div className="flex items-center gap-3">
          <Link href="/guide" target="_blank" className="text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]">Staff guide with screenshots</Link>
          {!p.ready && (
            <button type="button" className="text-[var(--pt-text-tertiary)] hover:text-[var(--pt-text-secondary)]" onClick={() => void setHidden(!data.hidden)}>
              {data.hidden ? "Show the guide on my dashboard" : "Hide it from my dashboard"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
